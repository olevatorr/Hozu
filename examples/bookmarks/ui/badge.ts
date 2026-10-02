import { ui } from '@hozu/core'
import { tv } from './tv.ts'

const styles = tv({ base: 'rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600' })

export const Badge = ui.component({
  tag: 'span',
  styles,
  children: true,
  render: ({ children }) => ui.span({}, children),
})
