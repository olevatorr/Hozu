import type { DevLocation, DevNode } from '@hozu/core/ir'

export type Scope = 'this' | 'component' | 'items'

export interface RequestItem {
  node: DevNode
  note: string
  scope: Scope
  visible: string
}

export interface RequestContext {
  path: string
  viewport: { width: number; height: number }
  preview: string | null
}

export interface HozuRequest {
  items: RequestItem[]
  context: RequestContext
}

export interface RequestJson {
  version: 1
  title: string
  context: RequestContext
  items: {
    id: string
    pointer: string | null
    kind: DevNode['kind']
    location: DevLocation | null
    component: string | null
    scope: Scope
    note: string
  }[]
}

const loc = (l: DevLocation | null) => (l ? `\`${l.file}:${l.line}:${l.column}\`` : 'an unknown place')

const listOf = (node: DevNode) => node.conditions.findLast((c) => c.kind === 'each')

export function labelOf(node: DevNode): string {
  if (node.page) return `page \`${node.page.route}\``
  const what = node.tag ? `<${node.tag}>` : node.kind
  return node.component ? `${what} · ${node.component.ref}` : what
}

const places = (n: number) => `${n} ${n === 1 ? 'place' : 'places'}`

export function scopesFor(node: DevNode): { scope: Scope; label: string }[] {
  const c = node.component
  const every = c
    ? [
        {
          scope: 'component' as const,
          label: `Every ${c.ref.split('.').pop()} like this (${places(c.uses)})`,
        },
      ]
    : []
  if (listOf(node))
    return [
      { scope: 'items', label: 'Every item in the list' },
      { scope: 'this', label: 'Only this item' },
      ...every,
    ]
  return [{ scope: 'this', label: 'Only this one' }, ...every]
}

export function titleOf(items: RequestItem[]): string {
  const note = items
    .find((i) => i.note.trim())
    ?.note.trim()
    .split('\n')[0]
  if (!note) return `Change ${items[0] ? labelOf(items[0].node) : 'the page'}`
  if (note.length <= 60) return note
  return `${note.slice(0, 60).replace(/\s+\S*$/, '')}…`
}

function excerpt(node: DevNode): string[] {
  if (!node.excerpt) return []
  const width = String(node.excerpt.start + node.excerpt.lines.length).length
  const mark = node.location?.line
  return [
    '```ts',
    ...node.excerpt.lines.map((text, i) => {
      const line = node.excerpt!.start + i
      return `${line === mark ? '>' : ' '} ${String(line).padStart(width)} | ${text}`
    }),
    '```',
  ]
}

function textGuidance(node: DevNode): string[] {
  const sources = node.source ? [node.source] : node.children.flatMap((c) => (c.source ? [c.source] : []))
  return sources.flatMap((s) => {
    switch (s.kind) {
      case 'literal':
        return node.source
          ? [`The text is the literal string at ${loc(node.location)}: edit that string only.`]
          : []
      case 'message':
        return [
          `Its text is message \`${s.detail}\`, declared at ${loc(s.location)}: change it there, in every locale.${
            (s.uses ?? 1) > 1
              ? ` It is used in ${places(s.uses!)}, and changing it changes all of them; to change only this text, give this one its own message.`
              : ''
          }`,
        ]
      case 'data':
        return [
          `Its text comes from data \`${s.detail}\` (query at ${loc(s.location)}). Changing what it says means changing the data or its formatting; the view only decides where it is shown.`,
        ]
      case 'context':
        return [
          `Its text shows machine context \`${s.detail}\`, set by the transitions in ${loc(node.machine)}.`,
        ]
      case 'route':
        return [`Its text comes from the URL (\`${s.detail}\`).`]
      default:
        return [`Its text is computed (\`${s.detail}\`).`]
    }
  })
}

function how(item: RequestItem): string[] {
  const { node, scope } = item
  const out: string[] = []
  const c = node.component
  const p = node.page
  if (p) {
    const h = p.head
    out.push(
      `This is page \`${p.route}\` (route \`${p.path}\` at ${loc(p.routeLocation)}), declared at ${loc(node.location)} with views ${p.views.map((v) => `\`${v}\``).join(', ')}.`,
      `Its \`<head>\` is derived from a closed set of fields in the page's \`head\`: title, description, type, image, published, noindex. Now: ${h.title ? `title “${h.title}”` : 'no title'}, ${h.description ? `description “${h.description}”` : 'no description'}${h.noindex ? ', noindex' : ''}${h.query ? `; it reads query \`${h.query}\`` : ''}.`,
    )
  }
  if (c && scope === 'component')
    out.push(
      `This is every \`${c.ref}\` (${places(c.uses)}). Change the variant in ${loc(c.declaration)}; every use changes. \`hozu impact ${c.ref}\` lists them.`,
    )
  else if (c)
    out.push(
      `This is one use of \`${c.ref}\` (declared at ${loc(c.declaration)}). For only this one, change \`class\` at the use; a property the component owns needs a trailing \`!\` on the class, or a variant.`,
    )
  else if (node.tag)
    out.push(
      `This is a \`<${node.tag}>\` in view \`${node.owner?.feature}.${node.owner?.view}\`: change its \`class\` there.`,
    )
  const list = listOf(node)
  if (list && scope === 'items')
    out.push(
      `It is inside a list: the change applies to every item of \`${list.detail.replace(/^item of /, '')}\` (${loc(list.location)}).`,
    )
  else if (list)
    out.push(
      `It is one item of a list (${loc(list.location)}). Changing only this item needs a field on the item that tells it apart, and a condition on that field.`,
    )
  for (const cond of node.conditions.filter((x) => x.kind !== 'each'))
    out.push(
      `It is shown only when ${cond.kind === 'query' ? `query ${cond.detail}` : cond.detail} (${loc(cond.location)}).`,
    )
  out.push(...textGuidance(node))
  for (const e of node.events) {
    const moves = e.transitions.map((t) => `\`${t.from} → ${t.to}\` (${loc(t.location)})`).join(', ')
    out.push(
      `On \`${e.dom}\` it sends \`${e.event}\`${moves ? `: ${moves}` : ''}. Changing what it does is a behaviour change: a deciding transition (a guard, a navigate or a computed value) needs a contract (HZ016); a copy-only change is accepted with \`hozu check --update-lock\`.`,
    )
  }
  return out
}

function verify(item: RequestItem, path: string): string[] {
  const { node, scope, visible } = item
  const out = ['`hozu check`']
  if (node.component) out.push(`\`hozu render ${node.component.ref}\``)
  if (node.component && scope === 'component') out.push(`\`hozu impact ${node.component.ref}\``)
  const name = visible.trim().replace(/\s+/g, ' ').slice(0, 40)
  if (name && (node.tag === 'button' || node.tag === 'a' || node.events.length))
    out.push(`\`hozu browse ${path} --do 'click "${name.replace(/['"]/g, '')}"'\``)
  else out.push(`\`hozu get ${path}\``)
  if (node.events.length) out.push('after `--update-lock`, list the accepted `now:` lines')
  if (node.pointer) out.push(`lines moved? \`hozu locate ${node.pointer}\``)
  return out
}

export function requestJson(request: HozuRequest): RequestJson {
  return {
    version: 1,
    title: titleOf(request.items),
    context: request.context,
    items: request.items.map(({ node, note, scope }) => ({
      id: node.id,
      pointer: node.pointer,
      kind: node.kind,
      location: node.location,
      component: node.component?.ref ?? null,
      scope,
      note,
    })),
  }
}

export function requestMarkdown(request: HozuRequest): string {
  const { context } = request
  const scopeLabel = (item: RequestItem) =>
    (scopesFor(item.node).find((s) => s.scope === item.scope)?.label ?? 'Only this one').replace(/^./, (c) =>
      c.toLowerCase(),
    )
  const lines = [
    `# Hozu request: ${titleOf(request.items)}`,
    '',
    `Page \`${context.path}\` · viewport ${context.viewport.width} × ${context.viewport.height}${context.preview ? ` · preview ${context.preview}` : ''}`,
    '',
    '> For the agent: each item names the file and line. Edit there, the Hozu way described, then run its verify commands.',
    '',
  ]
  request.items.forEach((item, i) => {
    const { node } = item
    lines.push(
      `## ${i + 1}. ${item.note.trim() ? item.note.trim().split('\n')[0] : `Change ${labelOf(node)}`}`,
      '',
      ...(item.note.trim().includes('\n') ? [item.note.trim(), ''] : []),
      `**Where:** ${loc(node.location)} — ${labelOf(node)}${node.owner ? ` in view \`${node.owner.feature}.${node.owner.view}\`` : ''} (node \`${node.id}\`)`,
      `**Scope:** ${scopeLabel(item)}`,
      '',
      ...excerpt(node),
      '',
      '**How, in Hozu terms:**',
      ...how(item).map((h) => `- ${h}`),
      '',
      '**Verify:**',
      ...verify(item, context.path).map((v) => `- ${v}`),
      '',
    )
  })
  lines.push(
    '**Rules:** No inline `style`: classes only, and every class must produce CSS (HZ026). A component owns some properties: change them through its variants. A deciding transition needs a contract.',
    '',
    '```hozu-request',
    JSON.stringify(requestJson(request), null, 2),
    '```',
    '',
  )
  return lines.join('\n')
}
