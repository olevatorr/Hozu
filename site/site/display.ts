import { ui, type Val } from '@hozu/core'
import { z } from 'zod'
import { tv } from './tv.ts'

export const Display = ui.component({
  tag: 'h1',
  styles: tv({ base: 'text-5xl font-black uppercase leading-[0.9] tracking-tight md:text-7xl' }),
  props: z.object({}),
  children: true,
  render: ({ children }) => ui.h1({ 'data-rise': '' }, children),
})
export const rise = (text: Val<string>, accent: boolean) =>
  ui.span({}, [
    ui.span({ class: accent ? 'inline-block animate-rise text-red' : 'inline-block animate-rise' }, [text]),
    ' ',
  ])
export const Heading = ui.component({
  tag: 'h2',
  styles: tv({ base: 'text-3xl font-black uppercase leading-none md:text-5xl' }),
  props: z.object({}),
  children: true,
  render: ({ children }) => ui.h2({}, children),
})
