import { remote, resolvers } from '@hozu/data'
import { app } from '@hozu/runtime-server'
import { accounts, me, signIn, signOut } from './features/account/model.ts'
import {
  addNote,
  listNotes,
  notesApi,
  pinNotes,
  removeNote,
  removeNotes,
  togglePin,
} from './features/notes/model.ts'
import project from './hozu.config.ts'

export default app({
  resolvers: resolvers(project, () =>
    remote(
      {
        url: { env: 'NOTES_SERVICE_URL' },
        secret: { env: 'NOTES_SERVICE_SECRET' },
        contract: new URL('./service/hozu/contract.go', import.meta.url),
      },
      [
        me,
        accounts,
        signIn,
        signOut,
        notesApi,
        listNotes,
        addNote,
        removeNote,
        removeNotes,
        pinNotes,
        togglePin,
      ],
    ),
  ),
})
