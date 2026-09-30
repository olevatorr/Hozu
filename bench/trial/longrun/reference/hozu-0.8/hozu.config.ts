import { project, ui } from '@hozu/core'
import { zodAdapter } from '@hozu/schema-zod'
import { account } from './features/account/feature.ts'
import { accounts, me, Session } from './features/account/model.ts'
import { AccountBar, AdminBoard, DeleteAccountPage, Login } from './features/account/views.ts'
import { notes } from './features/notes/feature.ts'
import { ArchiveBoard, NotesBoard } from './features/notes/views.ts'
import { accountDelete, admin, archive, list, login } from './routes.ts'

export default project({
  schema: zodAdapter,
  app: new URL('./app.ts', import.meta.url),
  styles: new URL('./app.css', import.meta.url),
  session: Session,
  site: { url: 'http://localhost:3000', name: 'Notes', lang: 'en', locales: ['en', 'de'] },
  routes: { list, login, archive, admin, accountDelete },
  pages: [
    ui.page(list, {
      views: [AccountBar, NotesBoard],
      head: {
        query: me,
        input: () => ({}),
        render: () => ({ title: 'Notes', noindex: true }),
        failed: { Unauthorized: login },
      },
    }),
    ui.page(archive, {
      views: [AccountBar, ArchiveBoard],
      head: {
        query: me,
        input: () => ({}),
        render: () => ({ title: 'Archive', noindex: true }),
        failed: { Unauthorized: login },
      },
    }),
    ui.page(accountDelete, {
      views: [DeleteAccountPage],
      head: {
        query: me,
        input: () => ({}),
        render: () => ({ title: 'Delete account', noindex: true }),
        failed: { Unauthorized: login },
      },
    }),
    ui.page(admin, {
      views: [AccountBar, AdminBoard],
      head: {
        query: accounts,
        input: () => ({}),
        render: () => ({ title: 'Admin', noindex: true }),
        failed: { Unauthorized: login, Forbidden: 403 },
      },
    }),
    ui.page(login, { views: [Login], head: { render: () => ({ title: 'Sign in' }) } }),
  ],
  features: [account, notes],
})
