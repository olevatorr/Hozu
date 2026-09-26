import { project } from '@tenon/core'
import { zodAdapter } from '@tenon/schema-zod'

export default project({
  schema: zodAdapter,
  styles: new URL('./app.css', import.meta.url),
  site: { url: 'http://localhost:3000', name: 'Tasks', lang: 'en' },
  routes: {},
  pages: [],
  features: [],
})
