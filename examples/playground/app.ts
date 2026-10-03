import { bundleComponents } from '@hozu/bundle'
import { resolvers } from '@hozu/data'
import { app } from '@hozu/runtime-server'
import { addNote, listNotes, person } from './features/lab/model.ts'
import project from './hozu.config.ts'

const notes = [
  { id: 'n1', text: 'Server data lives here, in app.ts' },
  { id: 'n2', text: 'Try the API tab in the DevTools dock' },
]

const postsApi = new URL(process.env.POSTS_API ?? 'https://jsonplaceholder.typicode.com').origin

export default app({
  components: bundleComponents,
  csp: { connect: [postsApi] },
  resolvers: resolvers(project, (implement) => [
    implement(listNotes, () => notes.map((n) => ({ ...n }))),
    implement(addNote, ({ text }) => {
      const note = { id: `n${notes.length + 1}`, text: text.trim() }
      notes.push(note)
      return { ...note }
    }),
    implement(person, async ({ id }, { fail, env }) => {
      const r = await fetch(`${env.USERS_API}/users/${id}`)
      if (r.status === 404) return fail('NotFound', { id })
      return r.ok ? r.json() : fail('Unavailable', { status: r.status })
    }),
  ]),
})
