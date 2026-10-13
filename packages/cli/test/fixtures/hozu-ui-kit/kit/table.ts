import { ui } from '@hozu/core'
import { tv } from './tv.ts'

const tableStyles = tv({
  slots: {
    base: 'overflow-x-auto',
    table: 'w-full text-left text-sm text-ink',
    head: 'border-b border-line',
    body: 'divide-y divide-line',
  },
})

export const Table = ui.component({
  tag: 'div',
  styles: tableStyles,
  slots: ['head'],
  children: true,
  render: ({ slots, children, classes }) =>
    ui.div({}, [
      ui.table({ class: classes.table }, [ui.thead({ class: classes.head }, [slots.head]), ui.tbody({ class: classes.body }, children)]),
    ]),
})

const cellBase = 'px-3 first:pl-5 last:pr-5 align-middle'

const thStyles = tv({
  base: `${cellBase} py-2.5 text-xs font-medium whitespace-nowrap text-ink-muted`,
  variants: { align: { start: 'text-left', end: 'text-right' } },
  defaultVariants: { align: 'start' },
})

export const Th = ui.component({
  tag: 'th',
  styles: thStyles,
  children: true,
  render: ({ children }) => ui.th({ scope: 'col' }, children),
})

const tdStyles = tv({
  base: `${cellBase} py-3`,
  variants: {
    align: { start: 'text-left', end: 'text-right tabular-nums' },
    emphasis: { normal: '', strong: 'font-medium text-ink', muted: 'text-ink-muted' },
  },
  defaultVariants: { align: 'start', emphasis: 'normal' },
})

export const Td = ui.component({
  tag: 'td',
  styles: tdStyles,
  children: true,
  render: ({ children }) => ui.td({}, children),
})

const rowStyles = tv({ base: 'transition-colors hover:bg-surface-sunken/60' })

export const Tr = ui.component({
  tag: 'tr',
  styles: rowStyles,
  children: true,
  render: ({ children }) => ui.tr({}, children),
})
