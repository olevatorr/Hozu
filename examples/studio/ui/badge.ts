import { ui } from '@hozu/core'
import { z } from 'zod'
import { tv } from './tv.ts'

const styles = tv({
  base: 'inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700 data-[tone=brand]:bg-brand data-[tone=brand]:text-white data-[tone=doing]:bg-amber-100 data-[tone=doing]:text-amber-800 data-[tone=done]:bg-emerald-100 data-[tone=done]:text-emerald-800',
})

export const Badge = ui.component({
  tag: 'span',
  styles,
  props: z.object({ tone: z.enum(['todo', 'doing', 'done', 'brand']).default('todo') }),
  children: true,
  render: ({ props, children }) => ui.span({ 'data-tone': props.tone }, children),
})
