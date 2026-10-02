import type { StyleChange } from '../prompt.ts'
import { normalHex, type StyleProp, type Theme } from '../theme.ts'
import { h } from './dom.ts'

const css: Record<StyleProp, string> = {
  fontSize: 'font-size',
  fontWeight: 'font-weight',
  color: 'color',
  backgroundColor: 'background-color',
  paddingInline: 'padding-inline',
  paddingBlock: 'padding-block',
  borderRadius: 'border-radius',
}

const plainNames: Record<StyleProp, string> = {
  fontSize: 'Text size',
  fontWeight: 'Boldness',
  color: 'Text colour',
  backgroundColor: 'Background',
  paddingInline: 'Space at the sides',
  paddingBlock: 'Space above and below',
  borderRadius: 'Corners',
}

const props = Object.keys(css) as StyleProp[]
const steps = [0, 0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12, 16]

export function current(el: Element, prop: StyleProp): string {
  const s = getComputedStyle(el)
  if (prop === 'color' || prop === 'backgroundColor') return normalHex(s[prop]) ?? s[prop]
  if (prop === 'paddingInline') return s.paddingLeft
  if (prop === 'paddingBlock') return s.paddingTop
  if (prop === 'borderRadius') return s.borderTopLeftRadius
  return s[prop]
}

export function preview(el: Element | null, changes: StyleChange[]) {
  if (!(el instanceof HTMLElement || el instanceof SVGElement)) return
  for (const prop of props) el.style.removeProperty(css[prop])
  for (const c of changes) el.style.setProperty(css[c.prop], c.to, 'important')
}

function options(prop: StyleProp, theme: Theme | null): [string, string][] {
  const t = theme
  const sorted = (table: Record<string, number>, unit: string, prefix: string) =>
    Object.entries(table)
      .sort((a, b) => a[1] - b[1])
      .map(([name, v]) => [`${v}${unit}`, `${prefix}${name} · ${v}${unit}`] as [string, string])
  if (prop === 'fontSize') return t ? sorted(t.text, 'px', 'text-') : []
  if (prop === 'fontWeight') return t ? sorted(t.weight, '', 'font-') : []
  if (prop === 'borderRadius')
    return t
      ? [
          ['0px', 'rounded-none · 0px'],
          ...sorted(t.radius, 'px', 'rounded-'),
          ['9999px', 'rounded-full · round'],
        ]
      : []
  if (prop === 'paddingInline' || prop === 'paddingBlock') {
    const p = prop === 'paddingInline' ? 'px' : 'py'
    return steps.map((n) => [`${n * (t?.spacing ?? 4)}px`, `${p}-${n} · ${n * (t?.spacing ?? 4)}px`])
  }
  return []
}

export function lookSection(
  el: Element | null,
  changes: StyleChange[],
  theme: Theme | null,
  plain: boolean,
  onChange: (changes: StyleChange[]) => void,
): HTMLElement {
  const set = (prop: StyleProp, to: string) => {
    const from = changes.find((c) => c.prop === prop)?.from ?? (el ? current(el, prop) : '')
    const next = changes.filter((c) => c.prop !== prop)
    if (to !== from) next.push({ prop, from, to })
    onChange(next)
  }
  const row = (prop: StyleProp) => {
    const now = changes.find((c) => c.prop === prop)?.to ?? (el ? current(el, prop) : '')
    const label = h('span', { class: 'what' }, [plain ? plainNames[prop] : css[prop]])
    if (prop === 'color' || prop === 'backgroundColor') {
      const input = h('input', {
        type: 'color',
        value: /^#[0-9a-f]{6}$/.test(now) ? now : '#000000',
        'aria-label': plainNames[prop],
        onchange: (e) => set(prop, (e.target as HTMLInputElement).value),
      })
      const swatches = (theme?.own ?? []).slice(0, 8).map((name) =>
        h('button', {
          class: 'swatch',
          type: 'button',
          title: name,
          'aria-label': name,
          'data-color': theme!.colors[name]!,
          onclick: () => set(prop, theme!.colors[name]!),
        }),
      )
      for (const s of swatches) s.style.background = s.getAttribute('data-color') ?? ''
      return h('div', { class: 'look' }, [
        label,
        h('div', { class: 'pick' }, [input, h('code', {}, [now]), ...swatches]),
      ])
    }
    const list = options(prop, theme)
    const known = list.some(([v]) => v === now)
    const select = h(
      'select',
      { 'aria-label': plainNames[prop], onchange: (e) => set(prop, (e.target as HTMLSelectElement).value) },
      [
        known ? null : h('option', { value: now, selected: true }, [`${now} (now)`]),
        ...list.map(([v, text]) =>
          h('option', { value: v, selected: v === now }, [plain ? text.split(' · ')[1]! : text]),
        ),
      ],
    )
    return h('div', { class: 'look' }, [label, select])
  }
  return h('div', { class: 'sec' }, [
    h('div', { class: 'label' }, [plain ? 'Look' : 'Style (preview)']),
    ...props.map(row),
    h('div', { class: 'row-end' }, [
      h('span', { class: 'hint-text' }, ['Preview only: the agent makes the real change.']),
      changes.length
        ? h('button', { class: 'link', type: 'button', onclick: () => onChange([]) }, ['Reset'])
        : null,
    ]),
  ])
}
