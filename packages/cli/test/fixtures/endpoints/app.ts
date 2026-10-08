import { resolvers } from '@hozu/data'
import { app } from '@hozu/runtime-server'
import project, { book, bookings, who } from './hozu.config.ts'

const booked: string[] = []

export default app({
  resolvers: resolvers(project, (implement) => [
    implement(who, ({ room }, { request, fail }) => {
      const token = (request as Request).headers.get('authorization') ?? ''
      return token ? { room, token } : fail('NoToken', { message: 'Send a bearer token' })
    }),
    implement(bookings, () => [...booked]),
    implement(book, ({ room }) => {
      booked.push(room)
      return { booked: room }
    }),
  ]),
})
