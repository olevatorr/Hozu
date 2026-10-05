import { messagesOf, setMessages } from '../messages.ts'

if (!(window.frameElement as HTMLElement | null)?.hasAttribute('data-hozu-bench'))
  void fetch('/_hozu/devtools/messages.json')
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}))
    .then((json) => {
      setMessages(messagesOf(json))
      return import('./app.ts')
    })
