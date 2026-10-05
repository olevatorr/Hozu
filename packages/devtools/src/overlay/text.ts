import { t } from '../messages.ts'
import { h } from './dom.ts'

export interface TextChange {
  from: string
  to: string
}

const ZH = '這是一段比較長的中文測試文字，用來檢查換行、截斷與對齊'
const EN = 'A much longer English label to check how the layout wraps and truncates'

function textNodes(el: Element): Text[] {
  return [...el.childNodes].filter((n): n is Text => n.nodeType === 3 && !!n.textContent?.trim())
}

export function firstText(el: Element | null): string | null {
  return el ? (textNodes(el)[0]?.data.trim() ?? null) : null
}

function put(el: Element | null, find: string[], value: string) {
  if (!el) return
  const nodes = textNodes(el)
  const node = nodes.find((n) => find.includes(n.data.trim())) ?? (nodes.length === 1 ? nodes[0] : undefined)
  if (!node) return
  const lead = /^\s*/.exec(node.data)?.[0] ?? ''
  const tail = /\s*$/.exec(node.data)?.[0] ?? ''
  node.data = `${lead}${value}${tail}`
}

export function previewText(el: Element | null, change: TextChange | undefined) {
  if (change) put(el, [change.from, change.to], change.to)
}

export function restoreText(el: Element | null, change: TextChange | undefined) {
  if (change) put(el, [change.to, change.from], change.from)
}

export function textSection(
  from: string,
  change: TextChange | undefined,
  plain: boolean,
  onChange: (change: TextChange | undefined) => void,
): HTMLElement {
  const set = (to: string) => onChange(to === from ? undefined : { from, to })
  const input = h('input', {
    type: 'text',
    class: 'outcome',
    'aria-label': t('text.input'),
    onchange: (e) => set((e.target as HTMLInputElement).value),
  }) as HTMLInputElement
  input.value = change?.to ?? from
  const chip = (label: string, to: string) =>
    h('button', { class: 'chip-button', type: 'button', onclick: () => set(to) }, [label])
  return h('div', { class: 'sec' }, [
    h('div', { class: 'label' }, [t(plain ? 'text.label' : 'text.label.preview')]),
    input,
    h('div', { class: 'chips' }, [
      chip(t('text.longer'), Array.from({ length: 4 }, () => from).join(' ')),
      chip('中文', ZH),
      chip('English', EN),
      change ? chip(t('text.reset'), from) : null,
    ]),
    h('div', { class: 'hint-text' }, [t('text.hint')]),
  ])
}
