import { feature, project, route, ui } from '@hozu/core'
import { zodAdapter } from '@hozu/schema-zod'
import { tv } from '@hozu/variants'
import { z } from 'zod'

const home = route({ path: '/', params: null, search: null })

const styles = tv({ base: 'rounded p-4' })

export const Card = ui.component({
  tag: 'section',
  styles,
  props: z.object({ title: z.string() }),
  render: ({ props }) => ui.section({}, [ui.h2({ class: 'font-semibold text-slate-900!' }, [props.title])]),
})

export const Home = ui.view({
  render: () => ui.main({}, [ui.use(Card, { props: { title: 'Hi' }, class: 'text-white' })]),
})

export default project({
  schema: zodAdapter,
  routes: { home },
  pages: [ui.page(home, { views: [Home], head: { render: () => ({ title: 'Home' }) } })],
  features: [feature({ id: 'look', intent: { summary: 'A card' }, declarations: [{ Card, Home }] })],
})
