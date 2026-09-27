import { project, ui } from '@hozu/core'
import { zodAdapter } from '@hozu/schema-zod'
import { z } from 'zod'
import { whoami } from './features/auth/model.ts'
import { auth, SignInForm } from './features/auth/views.ts'
import { NotesBoard, notes } from './features/notes/views.ts'
import { home, login } from './routes.ts'

export default project({
  schema: zodAdapter,
  styles: new URL('./app.css', import.meta.url),
  site: { url: 'http://localhost:3000', name: 'Notes', lang: 'en' },
  session: z.object({ user: z.string() }),
  routes: { home, login },
  pages: [
    ui.page(home, {
      views: [NotesBoard],
      head: {
        query: whoami,
        input: () => ({}),
        redirects: { SignedOut: login },
        render: () => ({ title: 'Notes', noindex: true }),
      },
    }),
    ui.page(login, {
      views: [SignInForm],
      head: { render: () => ({ title: 'Sign in' }) },
    }),
  ],
  features: [auth, notes],
})
