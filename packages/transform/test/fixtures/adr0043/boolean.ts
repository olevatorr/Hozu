import { ui } from '@hozu/core'
import { board } from './board.ts'

export const View = ui.view({
  machine: board,
  // biome-ignore lint/complexity/noExtraBooleanCast: the T5 mistake under test
  render: ({ ctx }) => ui.p({}, [Boolean(ctx.error) ? 'has error' : 'no error']),
})

export { board }
