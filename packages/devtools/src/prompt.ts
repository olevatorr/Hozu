import type { DevLocation, DevNode, DevTextSource, DevTransition } from '@hozu/core/ir'
import { currentUtility, type StyleProp, type Theme, utilityFor } from './theme.ts'

export type Scope = 'this' | 'component' | 'items'

export interface StyleChange {
  prop: StyleProp
  from: string
  to: string
}

/** A component to place at the selected part (ADR 0089 P5). */
export interface Addition {
  component: string
  variant: Record<string, string>
  position: 'before' | 'after' | 'inside'
  /** The command that installs it first, when the app does not have it yet. */
  install: string | null
  /** The file it is imported from, relative to the app. */
  file: string | null
  /** Props it requires (no default), so the agent passes them. */
  props?: string[]
  /** Whether it takes children. */
  children?: boolean
  /** The `p.example` it was dragged from: the agent builds it with that structure. */
  example?: { name: string; file: string | null; line: number }
  /**
   * The icon chosen for `prop`, exported as `name` from `file`; `lucide` names a Lucide icon the app does not have
   * yet, to be added to `file` first. `d` is its path data, for the preview on the page.
   */
  icon?: { prop: string; name: string; file: string; lucide?: string; d?: string }
}

export interface ComponentRef {
  id: string
  file: string
  line: number
}

export interface RequestItem {
  /** The selected part; null for a main component chosen in Assets without a use (`component`). */
  node: DevNode | null
  note: string
  scope: Scope
  visible: string
  style?: StyleChange[]
  text?: { from: string; to: string }
  add?: Addition
  component?: ComponentRef
}

export interface RequestContext {
  path: string
  viewport: { width: number; height: number }
  preview: string | null
  device?: string
}

export interface HozuRequest {
  items: RequestItem[]
  context: RequestContext
}

export interface PromptOptions {
  excerpt?: boolean
  theme?: Theme | null
}

export const styleNames: Record<StyleProp, string> = {
  fontSize: 'font size',
  fontWeight: 'font weight',
  color: 'text colour',
  backgroundColor: 'background',
  paddingInline: 'padding left and right',
  paddingBlock: 'padding top and bottom',
  borderRadius: 'corner radius',
  width: 'width',
  height: 'height',
  gap: 'gap',
  opacity: 'opacity',
  borderWidth: 'border width',
  borderColor: 'border colour',
  boxShadow: 'shadow',
}

function styleLine(change: StyleChange, classes: string | null, theme: Theme | null | undefined): string {
  const head = `- Style: ${styleNames[change.prop]} ${change.from} → ${change.to}`
  if (!theme) return head
  const u = utilityFor(change.prop, change.to, theme)
  const now = currentUtility(change.prop, classes ?? '', theme)
  const near = u.exact || !u.nearest ? '' : ` (nearest theme step \`${u.nearest}\`)`
  return `${head}: ${now ? `replace \`${now}\` with` : 'add'} \`${u.utility}\`${near}`
}

const loc = (l: DevLocation | null) => (l ? `\`${l.file}:${l.line}:${l.column}\`` : 'an unknown place')
const places = (n: number) => `${n} ${n === 1 ? 'place' : 'places'}`
const listOf = (node: DevNode) => node.conditions.findLast((c) => c.kind === 'each')
const sourcesOf = (node: DevNode): DevTextSource[] =>
  node.source ? [node.source] : node.children.flatMap((c) => (c.source ? [c.source] : []))

export function labelOf(node: DevNode): string {
  if (node.page) return `page ${node.page.route}`
  if (node.kind === 'text' && node.source) {
    const s = node.source
    if (s.kind === 'literal') return `text “${s.detail.slice(0, 40)}”`
    if (s.kind === 'message') return `text: message ${s.detail}`
    return `text from ${s.detail}`
  }
  const what = node.tag ? `<${node.tag}>` : node.kind
  return node.component ? `${what} · ${node.component.ref}` : what
}

export function scopesFor(node: DevNode): { scope: Scope; label: string }[] {
  const c = node.component
  const every = c
    ? [
        {
          scope: 'component' as const,
          label: `Main component · every ${c.ref.split('.').pop()} (${places(c.uses)})`,
        },
      ]
    : []
  if (listOf(node))
    return [
      { scope: 'items', label: 'Every item in the list' },
      { scope: 'this', label: 'Only this item' },
      ...every,
    ]
  return [{ scope: 'this', label: c ? 'This instance only' : 'Only this one' }, ...every]
}

const variantText = (variant: Record<string, string>) => {
  const entries = Object.entries(variant)
  return entries.length ? ` { ${entries.map(([k, v]) => `${k}: '${v}'`).join(', ')} }` : ''
}

const clip = (text: string, max: number) => {
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const space = cut.lastIndexOf(' ')
  return `${space > max / 2 ? cut.slice(0, space) : cut}…`
}

export function anchorOf(node: DevNode, visible: string): string {
  if (!node.tag) return labelOf(node)
  const text = clip(visible.trim(), 40)
  return `<${node.tag}${text ? ` "${text}"` : ''}>`
}

export function itemLabel(item: RequestItem): string {
  if (item.add)
    return `Add <${item.add.component}>${variantText(item.add.variant)} ${item.add.position} ${item.node ? anchorOf(item.node, item.visible) : 'the page'}`
  if (item.node) return labelOf(item.node)
  return item.component ? `<${item.component.id}> · Main component` : 'the page'
}

export function titleOf(items: RequestItem[]): string {
  const note = items
    .find((i) => i.note.trim())
    ?.note.trim()
    .split('\n')[0]
  const head = !note
    ? items[0]?.add
      ? itemLabel(items[0])
      : `Change ${items[0] ? itemLabel(items[0]) : 'the page'}`
    : note.length <= 60
      ? note
      : `${note.slice(0, 60).replace(/\s+\S*$/, '')}…`
  return items.length > 1 ? `${head} + ${items.length - 1} more` : head
}

function textMinds(node: DevNode): string[] {
  return sourcesOf(node).flatMap((s) => {
    switch (s.kind) {
      case 'message':
        return [
          (s.uses ?? 1) > 1
            ? `its text is message \`${s.detail}\` (${loc(s.location)}), shared by ${places(s.uses!)}; to change only this one, give it its own message.`
            : `its text is message \`${s.detail}\` (${loc(s.location)}): change it there, in every locale.`,
        ]
      case 'data':
        return [
          `the text comes from data \`${s.detail}\` (query at ${loc(s.location)}): change the data or its formatting, not the view.`,
        ]
      case 'context':
        return [
          `the text shows machine context \`${s.detail}\`, set by the transitions in ${loc(node.machine)}.`,
        ]
      case 'route':
        return [`the text comes from the URL (\`${s.detail}\`).`]
      case 'computed':
        return [`the text is computed (\`${s.detail}\`).`]
      default:
        return []
    }
  })
}

const textOrigins: Partial<Record<DevTextSource['kind'], [string, string]>> = {
  message: ['message', 'message'],
  data: ['data', 'data'],
  context: ['machine context', 'context'],
  route: ['the URL', 'URL'],
  computed: ['a computed value', 'value'],
}

function styleMinds(node: DevNode): string[] {
  return sourcesOf(node).flatMap((s) => {
    const origin = textOrigins[s.kind]
    return origin
      ? [
          `the text comes from ${origin[0]} \`${s.detail}\`; this is a style change: change the classes in this view, the ${origin[1]} stays.`,
        ]
      : []
  })
}

const changesText = (item: RequestItem): item is RequestItem & Required<Pick<RequestItem, 'text'>> =>
  !!item.text && item.text.to !== item.text.from

const sameEntry = (a: DevTransition, b: DevTransition) =>
  a.to === b.to &&
  !!a.location &&
  !!b.location &&
  a.location.file === b.location.file &&
  a.location.line === b.location.line &&
  a.location.column === b.location.column

function moves(transitions: DevTransition[]): { text: string; shared: boolean }[] {
  const groups: DevTransition[][] = []
  for (const t of transitions) {
    const group = groups.find((g) => sameEntry(g[0]!, t))
    if (group) group.push(t)
    else groups.push([t])
  }
  return groups.map((g) => {
    const t = g[0]!
    return g.length > 1
      ? {
          text: `shared \`on\` at ${loc(t.location)} (in ${g.map((x) => x.from).join(', ')}) → ${t.to}`,
          shared: true,
        }
      : { text: `${t.from} → ${t.to} at ${loc(t.location)}`, shared: false }
  })
}

function eventMind(e: DevNode['events'][number]): string {
  const list = moves(e.transitions)
  const shared = list.filter((m) => m.shared).length
  const covers =
    shared === 0 ? '' : shared === 1 ? '; one contract covers it' : '; one contract covers each shared `on`'
  const all = list.map((m) => m.text).join(', ')
  const what = list.length === 1 && shared === 1 ? `: ${all}` : all ? ` (${all})` : ''
  return `\`${e.dom}\` sends \`${e.event}\`${what}${covers}; a change of behaviour needs a contract when it decides (HZ016), otherwise \`hozu check --update-lock\`.`
}

function minds(item: RequestItem & { node: DevNode }): string[] {
  const { node, scope } = item
  const out: string[] = []
  const c = node.component
  const p = node.page
  if (p) {
    const h = p.head
    out.push(
      `the head is a closed set of fields: title, description, type, image, published, noindex. Now: ${h.title ? `title “${h.title}”` : 'no title'}, ${h.description ? `description “${h.description}”` : 'no description'}${h.noindex ? ', noindex' : ''}${h.query ? `, from query \`${h.query}\`` : ''}.`,
    )
  }
  if (c && scope === 'component')
    out.push(
      `change the variant in ${loc(c.declaration)}; all ${c.uses} uses change (\`hozu why ${c.ref}\` lists them).`,
    )
  else if (c && c.uses > 1)
    out.push(
      `\`${c.ref}\` is used in ${places(c.uses)}. For only this one, change \`class\` at this use; a property the component owns needs a trailing \`!\`.`,
    )
  const list = listOf(node)
  if (list && scope === 'items')
    out.push(
      `it is inside a list of \`${list.detail.replace(/^item of /, '')}\` (${loc(list.location)}): every item changes.`,
    )
  else if (list)
    out.push(
      `one item of a list (${loc(list.location)}): changing only this one needs a field on the item that tells it apart.`,
    )
  out.push(...(item.style?.length && !changesText(item) ? styleMinds(node) : textMinds(node)))
  for (const e of node.events) out.push(eventMind(e))
  return out
}

function excerpt(node: DevNode): string[] {
  if (!node.excerpt) return []
  const width = String(node.excerpt.start + node.excerpt.lines.length).length
  return [
    '```ts',
    ...node.excerpt.lines.map((text, i) => {
      const line = node.excerpt!.start + i
      return `${line === node.location?.line ? '>' : ' '} ${String(line).padStart(width)} | ${text}`
    }),
    '```',
  ]
}

function where(node: DevNode): string {
  if (node.page) return `${loc(node.location)} (route \`${node.page.path}\`, ${loc(node.page.routeLocation)})`
  return `${loc(node.location)}${node.owner ? ` (view \`${node.owner.feature}.${node.owner.view}\`)` : ''}`
}

function size(context: RequestContext): string {
  const { width, height } = context.viewport
  if (context.device === undefined) return `${width} × ${height}`
  const name = context.device && context.device !== 'Custom' ? ` ${context.device}` : ''
  return `Workbench${name} · ${width} × ${height} (verify: \`hozu browse --viewport ${width}x${height}\`)`
}

const want = (note: string) =>
  `- Want: ${note ? note.replace(/\n+/g, ' / ') : '(not described: ask the user what should change)'}`

function useOptions(add: Addition): string {
  const props = [
    ...(add.props ?? []).filter((p) => p !== add.icon?.prop).map((p) => `${p}: …`),
    ...(add.icon ? [`${add.icon.prop}: ${add.icon.name}`] : []),
  ]
  const parts = [
    ...(Object.keys(add.variant).length ? [`variant:${variantText(add.variant)}`] : []),
    ...(props.length ? [`props: { ${props.join(', ')} }`] : []),
  ]
  return parts.length ? `{ ${parts.join(', ')} }` : '{}'
}

function addMind(add: Addition, at: string): string {
  const name = add.component.split('.').pop() ?? add.component
  const from = add.file ?? `the kit of ${add.component}`
  if (add.example) {
    const where = add.example.file ? `\`${add.example.file}:${add.example.line}\`` : 'the previews'
    return `build it like the ‘${add.example.name}’ example in ${where}: copy that \`ui.use(${name}, …)\` with the parts, slots and children it uses (import ${name} from \`${from}\` and the others from their files in the kit), place it ${at}, and replace the sample text with the page's own`
  }
  const icon = add.icon
  const fetch = icon?.lucide
    ? `first add Lucide's \`${icon.lucide}\` icon to \`${icon.file}\` as \`export const ${icon.name} = '<path data>'\` (ISC; the \`d\` of every shape in \`icons/${icon.lucide}.svg\` of the \`lucide-static\` package, joined, or from https://lucide.dev/icons/${icon.lucide}); then `
    : ''
  const imports = icon
    ? `import it from \`${from}\` and \`{ ${icon.name} }\` from \`${icon.file}\` (from the app's root: \`import { ${icon.name} } from './${icon.file}'\`; the path is relative to the view's file)`
    : `import it from \`${from}\``
  return `${fetch}${imports}; place \`ui.use(${name}, ${useOptions(add)}${add.children === false ? '' : ', [...]'})\` ${at}`
}

function addLines(item: RequestItem & { add: Addition; node: DevNode }): string[] {
  const { add, node } = item
  const at = add.position === 'inside' ? 'inside it, as its last child' : `${add.position} it, as a sibling`
  return [
    want(item.note.trim()),
    `- Where: ${where(node)}`,
    ...(add.install ? [`- Install first: \`${add.install}\``] : []),
    `- Mind: ${addMind(add, at)}; \`hozu docs ui\` lists its props and slots.${node.conditions.length && add.position !== 'inside' ? ' If the selected part is the whole branch of a query, `when` or `?:`, the sibling goes into that branch too: return a list, or wrap both in a `ui.div`.' : ''}`,
    ...(node.pointer ? [`- Locate: \`hozu why ${node.pointer}\``] : []),
  ]
}

function componentLines(item: RequestItem & { component: ComponentRef }): string[] {
  const c = item.component
  return [
    want(item.note.trim()),
    `- Where: \`${c.file}:${c.line}\``,
    "- Scope: every use (the component's own file)",
    '- Mind: change its `tv()` styles or render in that file; uses keep their own class overrides.',
    `- Locate: \`hozu why ${c.id}\``,
  ]
}

export function requestMarkdown(request: HozuRequest, options: PromptOptions = {}): string {
  const { context } = request
  const scopeLabel = (item: RequestItem & { node: DevNode }) => {
    const c = item.node.component
    if (item.scope === 'component' && c)
      return `every ${c.ref.split('.').pop()} like this (${places(c.uses)})`
    if (item.scope === 'items') return 'every item in the list'
    return listOf(item.node) ? 'only this item' : 'only this one'
  }
  const lines = [
    `# Hozu request: ${titleOf(request.items)}`,
    '',
    `Page \`${context.path}\` · ${size(context)}${context.preview ? ` · preview ${context.preview}` : ''}`,
    '',
  ]
  request.items.forEach((item, i) => {
    const { node } = item
    lines.push(`## ${i + 1}. ${itemLabel(item)}`)
    if (!node || item.add) {
      if (item.add && node) lines.push(...addLines({ ...item, add: item.add, node }))
      else if (item.component) lines.push(...componentLines({ ...item, component: item.component }))
      lines.push('')
      return
    }
    lines.push(
      want(item.note.trim()),
      `- Where: ${where(node)}`,
      ...(options.excerpt ? excerpt(node) : []),
      `- Scope: ${scopeLabel({ ...item, node })}`,
      ...(item.style ?? []).map((c) => styleLine(c, node.classes, options.theme)),
      ...(changesText(item) ? [`- Text: “${item.text.from}” → “${item.text.to}”`] : []),
      ...node.conditions
        .filter((c) => c.kind !== 'each')
        .map(
          (c) => `- Shown when: ${c.kind === 'query' ? `query ${c.detail}` : c.detail} (${loc(c.location)})`,
        ),
      ...minds({ ...item, node }).map((m) => `- Mind: ${m}`),
      ...(node.pointer ? [`- Locate: \`hozu why ${node.pointer}\``] : []),
      '',
    )
  })
  lines.push('Run `hozu check` after the edits.', '')
  return lines.join('\n')
}

export function openRequestsLine(list: { file: string }[]): string {
  return `Do the open Hozu requests: ${list.map((r) => r.file).join(', ')}. For each one: make the change where it says, run \`hozu check\`, then \`hozu requests done <n> --result "<what changed>"\`.`
}

export function joinRequests(list: { number: string; markdown: string }[]): string {
  const parts = list.map(
    (r) =>
      `${r.markdown
        .replace(/^# Hozu request: /, `# Hozu request ${r.number}: `)
        .replace(/\nWhen done: [^\n]*\n?$/, '\n')
        .trimEnd()}\n`,
  )
  return [
    `# Hozu requests: ${list.length} open`,
    '',
    'Do each one below in order. Run `hozu check` after the edits.',
    '',
    ...parts.flatMap((p) => ['---', '', p]),
    '---',
    '',
    `When one is done: \`hozu requests done <n> --result "<what changed>"\` (${list.map((r) => r.number).join(', ')}).`,
    '',
  ].join('\n')
}
