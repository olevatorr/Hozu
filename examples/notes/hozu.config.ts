import { project, ui } from '@hozu/core'
import { zodAdapter } from '@hozu/schema-zod'
import { account } from './features/account/feature.ts'
import { me, Session } from './features/account/model.ts'
import { AccountBar, Login } from './features/account/views.ts'
import { notes } from './features/notes/feature.ts'
import { NotesBoard } from './features/notes/views.ts'
import { home, login } from './routes.ts'

export default project({
  schema: zodAdapter,
  app: new URL('./app.ts', import.meta.url),
  styles: new URL('./app.css', import.meta.url),
  session: Session,
  site: { url: 'http://localhost:3000', name: 'Notes', lang: 'en' },
  routes: { home, login },
  pages: [
    ui.page(home, {
      views: [AccountBar, NotesBoard],
      head: {
        query: me,
        input: () => ({}),
        render: () => ({ title: 'Notes', noindex: true }),
        failed: { Unauthorized: login },
      },
    }),
    ui.page(login, { views: [Login], head: { render: () => ({ title: 'Sign in' }) } }),
  ],
  features: [account, notes],
})
