import type { DevLocation, DevNode, DevTextSource, DevTransition } from '@hozu/core/ir'
import { currentUtility, type StyleProp, type Theme, utilityFor } from './theme.ts'

export type Scope = 'this' | 'component' | 'items'

export interface StyleChange {
  prop: StyleProp
  from: string
  to: string
}

export interface RequestItem {
  node: DevNode
  note: string
  scope: Scope
  visible: string
  style?: StyleChange[]
  text?: { from: string; to: string }
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

export function titleOf(items: RequestItem[]): string {
  const note = items
    .find((i) => i.note.trim())
    ?.note.trim()
    .split('\n')[0]
  const head = !note
    ? `Change ${items[0] ? labelOf(items[0].node) : 'the page'}`
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

function minds(item: RequestItem): string[] {
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

export function requestMarkdown(request: HozuRequest, options: PromptOptions = {}): string {
  const { context } = request
  const scopeLabel = (item: RequestItem) => {
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
    const note = item.note.trim()
    lines.push(
      `## ${i + 1}. ${labelOf(node)}`,
      `- Want: ${note ? note.replace(/\n+/g, ' / ') : '(not described: ask the user what should change)'}`,
      `- Where: ${where(node)}`,
      ...(options.excerpt ? excerpt(node) : []),
      `- Scope: ${scopeLabel(item)}`,
      ...(item.style ?? []).map((c) => styleLine(c, node.classes, options.theme)),
      ...(changesText(item) ? [`- Text: “${item.text.from}” → “${item.text.to}”`] : []),
      ...node.conditions
        .filter((c) => c.kind !== 'each')
        .map(
          (c) => `- Shown when: ${c.kind === 'query' ? `query ${c.detail}` : c.detail} (${loc(c.location)})`,
        ),
      ...minds(item).map((m) => `- Mind: ${m}`),
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
