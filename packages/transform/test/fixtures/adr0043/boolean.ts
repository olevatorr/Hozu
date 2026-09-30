import { ui } from '@hozu/core'
import { board } from './board.ts'

export const View = ui.view({
  machine: board,
  render: ({ ctx }) => ui.p({}, [ctx.error ? 'has error' : 'no error']),
})

export { board }
