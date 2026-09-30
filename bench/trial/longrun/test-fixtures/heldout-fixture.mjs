export const retires = { TG1: 22 }

export default function register(h) {
  h.check('X21a', 21, 'the vocabulary of step 21 equals step 20', 'fixture', async () => {
    h.assert(JSON.stringify(h.vocab(21)) === JSON.stringify(h.vocab(20)), 'vocab(21)')
    h.assert(h.V.home === '/notes', `home ${h.V.home}`)
  })
  h.check('X21b', 21, 'the list redirects to /login when signed out', 'fixture', async () => {
    h.assert(h.isRedirectTo(await fetch(h.base + h.V.home, { redirect: 'manual' }), '/login'), 'no redirect')
  })
  h.check(
    'X22a',
    22,
    'a fresh user signs in and adds a note',
    'fixture',
    async () => {
      const page = await h.fresh('X22a')
      await h.add(page, 'Held out')
      h.assert(await h.has(page, 'Held out'), `list ${await h.items(page)}`)
    },
    23,
  )
}
