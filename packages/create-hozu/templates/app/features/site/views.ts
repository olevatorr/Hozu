import { ui } from '@hozu/core'

export const Home = ui.view({
  render: () =>
    ui.main({ class: 'mx-auto max-w-xl space-y-4 px-4 py-12' }, [
      ui.h1({ class: 'text-3xl font-bold' }, ['Hello, Hozu']),
      ui.p({ class: 'text-slate-600' }, ['Edit features/site/views.ts to get started.']),
    ]),
})
