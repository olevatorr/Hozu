import { previews } from '@hozu/core/preview'
import { me } from './features/account/model.ts'
import { listNotes } from './features/notes/model.ts'
import { home } from './routes.ts'
import { Button } from './ui/button.ts'
import { Field } from './ui/field.ts'

export default previews((p) => {
  const ada = p.data(me, { name: 'ada' })
  return [
    p.component(Button, 'Long label', {
      variant: { tone: 'primary' },
      children: 'Save every note you wrote today',
    }),
    p.component(Field, 'With an error', {
      props: { for: 'note', label: 'Note', error: 'Write something', errorId: 'note-error' },
      slots: { control: 'The input goes here' },
    }),
    p.page(home, 'No notes', [ada, p.data(listNotes, [])]),
    p.page(home, 'Twelve notes', [
      ada,
      p.data(
        listNotes,
        Array.from({ length: 12 }, (_, i) => ({ id: `p${i}`, text: `Preview note ${i + 1}`, pinned: i < 2 })),
      ),
    ]),
    p.page(home, 'Notes failed', [ada, p.fail(listNotes, 'Unexpected')]),
  ]
})
