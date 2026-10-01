import { ui } from '@hozu/core'
import { z } from 'zod'
import { tv } from './tv.ts'

const styles = tv({ base: 'bg-ink px-5 py-10 text-sm text-paper' })
export const SiteFooter = ui.component({
  tag: 'footer',
  styles,
  props: z.object({}),
  children: true,
  render: ({ children }) => ui.footer({}, [ui.div({ class: 'mx-auto max-w-6xl' }, children)]),
})
