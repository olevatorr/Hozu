import { ui } from '@hozu/core'
import { tv } from './tv.ts'

const styles = tv({ base: 'rounded-xl border border-slate-200 bg-white p-4 shadow-sm' })

export const Card = ui.component({
  tag: 'section',
  styles,
  children: true,
  render: ({ children }) => ui.section({}, children),
})
