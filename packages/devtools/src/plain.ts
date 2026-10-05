import type { DevCondition, DevNode } from '@hozu/core/ir'
import { type MessageKey, t } from './messages.ts'
import type { Scope } from './prompt.ts'

const tags: Record<string, MessageKey> = {
  a: 'plain.tag.link',
  button: 'plain.tag.button',
  form: 'plain.tag.form',
  img: 'plain.tag.image',
  input: 'plain.tag.input',
  textarea: 'plain.tag.textBox',
  select: 'plain.tag.dropdown',
  label: 'plain.tag.label',
  p: 'plain.tag.paragraph',
  ul: 'plain.tag.list',
  ol: 'plain.tag.list',
  li: 'plain.tag.listItem',
  nav: 'plain.tag.menu',
  table: 'plain.tag.table',
  span: 'plain.tag.text',
  strong: 'plain.tag.text',
  em: 'plain.tag.text',
}

const words = (name: string) => {
  const spaced = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

export function tagName(tag: string): string {
  if (/^h[1-6]$/.test(tag)) return t('plain.tag.heading')
  return t(tags[tag] ?? 'plain.tag.area')
}

export function friendlyName(node: DevNode): string {
  if (node.page) return t('plain.name.page')
  if (node.kind === 'text') return t(node.source?.kind === 'data' ? 'plain.name.dataText' : 'plain.tag.text')
  if (node.component) return node.component.ref.split('.').pop() ?? t('plain.name.component')
  if (node.tag && /^h[1-6]$/.test(node.tag)) return t('plain.tag.heading')
  if (node.tag && tags[node.tag]) return t(tags[node.tag]!)
  if (node.kind === 'list') return t('plain.tag.list')
  return t('plain.tag.area')
}

function shown(c: DevCondition): string | null {
  if (c.kind === 'when') {
    const states = c.detail.replace(/^state in /, '').split(' | ')
    return t('plain.shown.while', { states: states.map((s) => words(s).toLowerCase()).join(t('plain.or')) })
  }
  if (c.kind === 'if') return t('plain.shown.if')
  if (c.kind === 'query') {
    if (c.detail.endsWith(' ready')) return t('plain.shown.ready')
    if (c.detail.endsWith(' pending')) return t('plain.shown.pending')
    return t('plain.shown.failed', { error: c.detail.split('failed.').pop() ?? '' })
  }
  return null
}

export function describeFor(node: DevNode): string[] {
  const out: string[] = []
  const c = node.component
  if (c && c.uses > 1) out.push(t('plain.about.shared', { name: friendlyName(node), count: c.uses }))
  const sources = node.source ? [node.source] : node.children.flatMap((x) => (x.source ? [x.source] : []))
  for (const s of sources) {
    if (s.kind === 'message' && (s.uses ?? 1) > 1)
      out.push(
        t(s.uses! - 1 === 1 ? 'plain.about.sharedText.one' : 'plain.about.sharedText.other', {
          count: s.uses! - 1,
        }),
      )
    if (s.kind === 'data') out.push(t('plain.about.dataText'))
  }
  if (node.conditions.some((x) => x.kind === 'each')) out.push(t('plain.about.listItem'))
  for (const x of node.conditions) {
    const line = shown(x)
    if (line) out.push(line)
  }
  for (const e of node.events)
    out.push(
      e.dom === 'submit'
        ? t('plain.about.submit', { action: words(e.event.split('.').pop() ?? e.event) })
        : t('plain.about.event', { dom: e.dom, action: words(e.event.split('.').pop() ?? e.event) }),
    )
  if (node.page) out.push(t('plain.about.page'))
  return out
}

export function questionFor(
  node: DevNode,
): { question: string; options: Partial<Record<Scope, string>> } | null {
  const c = node.component
  const name = friendlyName(node)
  const every = c ? { component: t('plain.scope.component', { name, count: c.uses }) } : {}
  const one = t(c ? 'plain.scope.instance' : 'plain.scope.thisOne')
  if (node.conditions.some((x) => x.kind === 'each'))
    return {
      question: c ? t('plain.ask.listComponent', { name }) : t('plain.ask.list'),
      options: { items: t('plain.scope.items'), this: one, ...every },
    }
  if (c)
    return {
      question: t('plain.ask.component', { name }),
      options: { this: one, ...every },
    }
  return null
}
