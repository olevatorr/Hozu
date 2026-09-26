import { feature, ui } from '@tenonkit/core'

export const Home = ui.view({
  render: () =>
    ui.main({ class: 'mx-auto max-w-xl space-y-4 px-4 py-12' }, [
      ui.h1({ class: 'text-3xl font-bold' }, ['Hello, Tenon']),
      ui.p({ class: 'text-slate-600' }, ['Edit features/site/views.ts to get started.']),
    ]),
})

export const site = feature({
  id: 'site',
  intent: { summary: 'The start page' },
  declarations: { Home },
})
