import { ui } from '@hozu/core'
import { z } from 'zod'
import { tv } from './tv.ts'

const styles = tv({
  base: 'inline-block px-1.5 py-0.5 font-mono text-xs font-bold leading-none',
  variants: { tone: { red: 'bg-red text-ink', ink: 'bg-ink text-paper' } },
  defaultVariants: { tone: 'ink' },
})
export const Tag = ui.component({
  tag: 'span',
  styles,
  props: z.object({}),
  children: true,
  render: ({ children }) => ui.span({}, children),
})
