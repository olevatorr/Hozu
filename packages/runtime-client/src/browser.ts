import { hydrate } from './hydrate.ts'

const once = 'hozu:reloaded'
const remember = (set: boolean) => {
  try {
    if (!set) return sessionStorage.removeItem(once)
    const first = !sessionStorage.getItem(once)
    sessionStorage.setItem(once, '1')
    return first
  } catch {
    return false
  }
}

hydrate(document).then(
  () => remember(false),
  (error: unknown) => {
    if (error instanceof TypeError && /import|module/i.test(error.message) && remember(true))
      location.reload()
    else throw error
  },
)
