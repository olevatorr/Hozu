import { project } from '@tenon/core'
import { zodAdapter } from '@tenon/schema-zod'

export default project({
  schema: zodAdapter,
  styles: new URL('./app.css', import.meta.url),
  notFound: null,
  session: null,
  site: { url: 'http://localhost:3000', name: 'Tasks', lang: 'en', icon: null, themeColor: null },
  routes: {},
  pages: [],
  features: [],
})
