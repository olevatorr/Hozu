import { ui } from '@hozu/core'
import { z } from 'zod'
import { tv } from './tv.ts'

const styles = tv({
  slots: {
    base: 'relative inline-block [anchor-scope:--menu]',
    trigger: 'inline-flex h-9 items-center gap-2 rounded-control border border-line-strong bg-surface px-3 text-sm text-ink shadow-control [anchor-name:--menu] hover:bg-surface-sunken aria-expanded:bg-surface-sunken',
    panel: 'm-0 min-w-44 rounded-card border border-line bg-surface-raised p-1 text-sm text-ink shadow-overlay [position-anchor:--menu] [position-area:bottom_span-right] [position-try-fallbacks:flip-block,flip-inline] mt-1 opacity-0 transition-[opacity,display,overlay] transition-discrete open:opacity-100 starting:open:opacity-0',
  },
})

export const DropdownMenu = ui.component({
  tag: 'div',
  styles,
  props: z.object({ id: z.string(), label: z.string() }),
  children: true,
  render: ({ props, children, classes }) =>
    ui.div({}, [
      ui.button({ type: 'button', class: classes.trigger, popovertarget: props.id }, [props.label]),
      ui.div({ id: props.id, popover: 'auto', role: 'menu', class: classes.panel }, children),
    ]),
})

const itemStyles = tv({
  base: 'flex w-full items-center gap-2 rounded-control px-2.5 py-1.5 text-left text-ink hover:bg-surface-sunken focus-visible:bg-surface-sunken focus-visible:outline-none',
  variants: { intent: { normal: '', destructive: 'text-danger-text' } },
  defaultVariants: { intent: 'normal' },
})

export const MenuItem = ui.component({
  tag: 'button',
  styles: itemStyles,
  props: z.object({ commandfor: z.string().optional(), command: z.enum(['show-modal', 'close', 'hide-popover']).optional() }),
  children: true,
  events: ['press'],
  render: ({ props, children, on }) =>
    ui.button({ type: 'button', role: 'menuitem', commandfor: props.commandfor, command: props.command, on: { click: on.press } }, children),
})
