import { ui } from '@hozu/core'
import { board, type Note } from './board.ts'

const noteItem = (note: Note) => ui.li({}, [note.text, note.pinned ? ' Unpin' : ' Pin'])

export const View = ui.view({
  machine: board,
  render: ({ ctx }) => ui.ul({}, [ui.each(ctx.notes, 'id', (note) => noteItem(note))]),
})

export { board }
