import type { StyleChange } from '../prompt.ts'
import { borderSteps, normalHex, type StyleProp, type Theme, utilityFor } from '../theme.ts'
import { h } from './dom.ts'

const css: Record<StyleProp, string> = {
  width: 'width',
  height: 'height',
  borderRadius: 'border-radius',
  gap: 'gap',
  paddingInline: 'padding-inline',
  paddingBlock: 'padding-block',
  opacity: 'opacity',
  backgroundColor: 'background-color',
  borderWidth: 'border-width',
  borderColor: 'border-color',
  boxShadow: 'box-shadow',
  fontSize: 'font-size',
  fontWeight: 'font-weight',
  color: 'color',
}

const figmaNames: Record<StyleProp, string> = {
  width: 'W',
  height: 'H',
  borderRadius: 'Corner radius',
  gap: 'Gap',
  paddingInline: 'Horizontal padding',
  paddingBlock: 'Vertical padding',
  opacity: 'Opacity',
  backgroundColor: 'Fill',
  borderWidth: 'Stroke weight',
  borderColor: 'Stroke',
  boxShadow: 'Drop shadow',
  fontSize: 'Font size',
  fontWeight: 'Weight',
  color: 'Text colour',
}

/** Figma's Design panel, in its order (ADR 0058 B1). */
export const groups: [string, StyleProp[]][] = [
  ['Frame', ['width', 'height', 'borderRadius']],
  ['Auto layout', ['gap', 'paddingInline', 'paddingBlock']],
  ['Layer', ['opacity']],
  ['Fill', ['backgroundColor']],
  ['Stroke', ['borderWidth', 'borderColor']],
  ['Effects', ['boxShadow']],
  ['Text', ['fontSize', 'fontWeight', 'color']],
]

const props = groups.flatMap(([, list]) => list)
const colours: StyleProp[] = ['color', 'backgroundColor', 'borderColor']
const steps = [0, 0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12, 16]
const sizes = [0, 4, 6, 8, 10, 12, 16, 20, 24, 32, 40, 48, 56, 64, 72, 80, 96]

export function current(el: Element, prop: StyleProp): string {
  const s = (el.ownerDocument.defaultView ?? window).getComputedStyle(el)
  if (colours.includes(prop)) {
    const v = prop === 'borderColor' ? s.borderTopColor : s[prop as 'color']
    if (v === 'transparent' || /^rgba\(.*,\s*0\)$/.test(v)) return 'transparent'
    return normalHex(v) ?? v
  }
  if (prop === 'paddingInline') return s.paddingLeft
  if (prop === 'paddingBlock') return s.paddingTop
  if (prop === 'borderRadius') return s.borderTopLeftRadius
  if (prop === 'borderWidth') return s.borderTopStyle === 'none' ? '0px' : s.borderTopWidth
  if (prop === 'gap') return s.columnGap === 'normal' ? '0px' : s.columnGap
  if (prop === 'width' || prop === 'height') return `${Math.round(el.getBoundingClientRect()[prop])}px`
  return s[prop]
}

export function preview(el: Element | null, changes: StyleChange[]) {
  if (!el || !('style' in el)) return
  const style = (el as HTMLElement).style
  for (const prop of props) style.removeProperty(css[prop])
  style.removeProperty('border-style')
  for (const c of changes) {
    style.setProperty(css[c.prop], c.to, 'important')
    if (c.prop === 'borderWidth' && c.to !== '0px') style.setProperty('border-style', 'solid', 'important')
  }
}

type Option = [value: string, token: string | null, utility: string]

function options(prop: StyleProp, theme: Theme | null): Option[] {
  const t = theme
  const unit = t?.spacing ?? 4
  const sorted = (table: Record<string, number>, suffix: string, prefix: string) =>
    Object.entries(table)
      .sort((a, b) => a[1] - b[1])
      .map(([name, v]) => [`${v}${suffix}`, name, `${prefix}${name}`] as Option)
  const scale = (list: number[], prefix: string) =>
    list.map((n) => [`${n * unit}px`, null, `${prefix}-${n}`] as Option)
  if (prop === 'fontSize') return t ? sorted(t.text, 'px', 'text-') : []
  if (prop === 'fontWeight') return t ? sorted(t.weight, '', 'font-') : []
  if (prop === 'borderRadius')
    return t
      ? [
          ['0px', 'none', 'rounded-none'],
          ...sorted(t.radius, 'px', 'rounded-'),
          ['9999px', 'full', 'rounded-full'],
        ]
      : []
  if (prop === 'paddingInline') return scale(steps, 'px')
  if (prop === 'paddingBlock') return scale(steps, 'py')
  if (prop === 'gap') return scale(steps, 'gap')
  if (prop === 'width' || prop === 'height') {
    const p = prop === 'width' ? 'w' : 'h'
    return [['auto', 'auto', `${p}-auto`], ['100%', 'fill', `${p}-full`], ...scale(sizes, p)]
  }
  if (prop === 'opacity')
    return Array.from({ length: 21 }, (_, i) => [`${i / 20}`, `${i * 5}%`, `opacity-${i * 5}`] as Option)
  if (prop === 'borderWidth')
    return borderSteps.map((n) => [`${n}px`, null, n === 1 ? 'border' : `border-${n}`] as Option)
  if (prop === 'boxShadow')
    return t
      ? [
          ['none', 'none', 'shadow-none'],
          ...Object.entries(t.shadow).map(([n, v]) => [v, n, `shadow-${n}`] as Option),
        ]
      : []
  return []
}

/** Builder reads the token first (`2xl · 24px`), Developer the class (`text-2xl · 24px`) (ADR 0058 B2). */
const optionText = (prop: StyleProp, [value, token, utility]: Option, plain: boolean) => {
  const shown = prop === 'boxShadow' ? (token === 'none' ? 'none' : 'shadow') : value
  if (!plain) return `${utility} · ${shown}`
  return token && token !== shown ? `${token} · ${shown}` : shown
}

const tokenOf = (prop: StyleProp, value: string, theme: Theme | null) => {
  if (!theme || !/^#[0-9a-f]{6}$/.test(value)) return null
  const u = utilityFor(prop, value, theme)
  return u.exact ? u.utility.replace(/^(text|bg|border)-/, '') : null
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
  const nameOf = (prop: StyleProp) => (plain ? figmaNames[prop] : css[prop])
  const row = (prop: StyleProp) => {
    const now = changes.find((c) => c.prop === prop)?.to ?? (el ? current(el, prop) : '')
    const label = h('span', { class: 'what' }, [nameOf(prop)])
    if (colours.includes(prop)) {
      const input = h('input', {
        type: 'color',
        value: /^#[0-9a-f]{6}$/.test(now) ? now : '#000000',
        'aria-label': figmaNames[prop],
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
      const token = plain ? tokenOf(prop, now, theme) : null
      return h('div', { class: 'look' }, [
        label,
        h('div', { class: 'pick' }, [
          input,
          h('code', {}, [now === 'transparent' ? 'none' : token ? `${token} · ${now}` : now]),
          ...swatches,
        ]),
      ])
    }
    const list = options(prop, theme)
    const known = list.some(([v]) => v === now)
    const select = h(
      'select',
      { 'aria-label': figmaNames[prop], onchange: (e) => set(prop, (e.target as HTMLSelectElement).value) },
      [
        known
          ? null
          : h('option', { value: now, selected: true }, [
              `${prop === 'boxShadow' && now !== 'none' ? 'shadow' : now} (now)`,
            ]),
        ...list.map((o) =>
          h('option', { value: o[0], selected: o[0] === now }, [optionText(prop, o, plain)]),
        ),
      ],
    )
    return h('div', { class: 'look' }, [label, select])
  }
  return h('div', { class: 'sec' }, [
    h('div', { class: 'label' }, [plain ? 'Design' : 'Style (preview)']),
    ...groups.map(([title, list]) =>
      h('div', { class: 'look-group', 'data-group': title }, [
        h('div', { class: 'look-title' }, [title]),
        ...list.map(row),
      ]),
    ),
    h('div', { class: 'row-end' }, [
      h('span', { class: 'hint-text' }, ['Preview only: the agent makes the real change.']),
      changes.length
        ? h('button', { class: 'link', type: 'button', onclick: () => onChange([]) }, ['Reset'])
        : null,
    ]),
  ])
}
