import { project, ui } from '@hozu/core'
import { zodAdapter } from '@hozu/schema-zod'
import { z } from 'zod'
import { account } from './features/account/feature.ts'
import { accounts, me, Session } from './features/account/model.ts'
import { AccountBar, Admin, Login } from './features/account/views.ts'
import { notes } from './features/notes/feature.ts'
import { NotesBoard } from './features/notes/views.ts'
import { admin, home, login } from './routes.ts'
import { kit } from './ui/kit.ts'

export default project({
  schema: zodAdapter,
  app: new URL('./app.ts', import.meta.url),
  previews: new URL('./previews.ts', import.meta.url),
  styles: new URL('./app.css', import.meta.url),
  session: Session,
  env: {
    server: z.object({
      NOTES_SERVICE_URL: z.string().default('http://127.0.0.1:4801/effect'),
      NOTES_SERVICE_SECRET: z.string().min(16),
    }),
  },
  site: { url: 'http://localhost:3000', name: 'Notes', lang: 'en', locales: ['en', 'de'] },
  routes: { home, login, admin },
  pages: [
    ui.page(home, {
      views: [AccountBar, NotesBoard],
      head: {
        query: me,
        input: () => ({}),
        render: () => ({ title: 'Notes', noindex: true }),
        failed: { Forbidden: login },
      },
    }),
    ui.page(login, { views: [Login], head: { render: () => ({ title: 'Sign in' }) } }),
    ui.page(admin, {
      views: [AccountBar, Admin],
      head: {
        query: accounts,
        input: () => ({}),
        render: () => ({ title: 'Accounts', noindex: true }),
        failed: { Forbidden: login, NotAdmin: 403 },
      },
    }),
  ],
  kits: [kit],
  features: [account, notes],
})
