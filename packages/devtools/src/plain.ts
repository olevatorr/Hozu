import type { DevCondition, DevNode } from '@hozu/core/ir'
import type { Scope } from './prompt.ts'

const tags: Record<string, string> = {
  a: 'Link',
  button: 'Button',
  form: 'Form',
  img: 'Image',
  input: 'Input',
  textarea: 'Text box',
  select: 'Dropdown',
  label: 'Label',
  p: 'Paragraph',
  ul: 'List',
  ol: 'List',
  li: 'List item',
  nav: 'Menu',
  table: 'Table',
  span: 'Text',
  strong: 'Text',
  em: 'Text',
}

const words = (name: string) => {
  const spaced = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

export function tagName(tag: string): string {
  if (/^h[1-6]$/.test(tag)) return 'Heading'
  return tags[tag] ?? 'Area'
}

export function friendlyName(node: DevNode): string {
  if (node.page) return 'This page'
  if (node.kind === 'text') return node.source?.kind === 'data' ? 'Text from your data' : 'Text'
  if (node.component) return node.component.ref.split('.').pop() ?? 'Component'
  if (node.tag && /^h[1-6]$/.test(node.tag)) return 'Heading'
  if (node.tag && tags[node.tag]) return tags[node.tag]!
  if (node.kind === 'list') return 'List'
  return 'Area'
}

function shown(c: DevCondition): string | null {
  if (c.kind === 'when') {
    const states = c.detail.replace(/^state in /, '').split(' | ')
    return `Shown only while ${states.map((s) => words(s).toLowerCase()).join(' or ')}.`
  }
  if (c.kind === 'if') return 'Shown only when a condition holds.'
  if (c.kind === 'query') {
    if (c.detail.endsWith(' ready')) return 'Shown once its data has loaded.'
    if (c.detail.endsWith(' pending')) return 'Shown while its data is loading.'
    return `Shown when loading its data fails (${c.detail.split('failed.').pop()}).`
  }
  return null
}

export function describeFor(node: DevNode): string[] {
  const out: string[] = []
  const c = node.component
  if (c && c.uses > 1)
    out.push(`A shared ${friendlyName(node)}: the same design is used in ${c.uses} places.`)
  const sources = node.source ? [node.source] : node.children.flatMap((x) => (x.source ? [x.source] : []))
  for (const s of sources) {
    if (s.kind === 'message' && (s.uses ?? 1) > 1)
      out.push(`Its text is shared with ${s.uses! - 1} other ${s.uses! - 1 === 1 ? 'place' : 'places'}.`)
    if (s.kind === 'data') out.push('Its text comes from your data, not from the page design.')
  }
  if (node.conditions.some((x) => x.kind === 'each'))
    out.push('One item of a list: changes apply to every item unless you say which.')
  for (const x of node.conditions) {
    const line = shown(x)
    if (line) out.push(line)
  }
  for (const e of node.events)
    out.push(
      `When ${e.dom === 'submit' ? 'submitted' : `${e.dom}ed`}, it does “${words(e.event.split('.').pop() ?? e.event)}”.`,
    )
  if (node.page) out.push('Its title and description are what search engines and shared links show.')
  return out
}

export function questionFor(
  node: DevNode,
): { question: string; options: Partial<Record<Scope, string>> } | null {
  const c = node.component
  const name = friendlyName(node)
  const every = c ? { component: `Main component · every ${name} (${c.uses} places)` } : {}
  const one = c ? 'This instance only' : 'Only this one'
  if (node.conditions.some((x) => x.kind === 'each'))
    return {
      question: c
        ? `Change every item, this instance only, or the main component (every ${name})?`
        : 'Change every item in the list, or only this one?',
      options: { items: 'Every item', this: one, ...every },
    }
  if (c)
    return {
      question: `Change this instance only, or the main component (every ${name})?`,
      options: { this: one, ...every },
    }
  return null
}
