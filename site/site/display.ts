import { ui } from '@hozu/core'
import { z } from 'zod'
import { tv } from './tv.ts'

const Word = z.object({ id: z.string(), text: z.string(), accent: z.boolean() })
export const Display = ui.component({
  tag: 'h1',
  styles: tv({ base: 'text-5xl font-black uppercase leading-[0.9] tracking-tight md:text-7xl' }),
  props: z.object({ words: z.array(Word).default([]) }),
  children: true,
  render: ({ props, children }) =>
    ui.h1({ 'data-rise': '' }, [
      ...children,
      ui.each(props.words, 'id', (w) =>
        ui.span({}, [
          ui.span({ class: 'inline-block animate-rise', toggle: { 'text-red': w.accent } }, [w.text]),
          ' ',
        ]),
      ),
    ]),
})
export const Heading = ui.component({
  tag: 'h2',
  styles: tv({ base: 'text-3xl font-black uppercase leading-none md:text-5xl' }),
  props: z.object({}),
  children: true,
  render: ({ children }) => ui.h2({}, children),
})
