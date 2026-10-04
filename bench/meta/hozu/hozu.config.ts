import { project, route, ui } from '@hozu/core'
import { zodAdapter } from '@hozu/schema-zod'
import { shop } from './features/shop/feature.ts'
import { Page } from './features/shop/views.ts'

const home = route({ path: '/', params: null, search: null })

export default project({
  schema: zodAdapter,
  app: new URL('./app.ts', import.meta.url),
  routes: { home },
  pages: [
    ui.page(home, {
      views: [Page],
      head: { render: () => ({ title: 'Products', description: 'Benchmark page' }) },
    }),
  ],
  features: [shop],
})
