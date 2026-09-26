import type { Json } from '@hozu/core/ir'
import { createHandler, type HandlerOptions } from '@hozu/runtime-server'

export interface TestPage {
  status: number
  headers: Headers
  html: string
  text: string
  payload: Json | null
}

export interface TestApp {
  get(path: string, init?: RequestInit): Promise<TestPage>
  post(path: string, form: Record<string, string>, init?: RequestInit): Promise<TestPage>
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' }

export const visibleText = (html: string): string =>
  html
    .replace(/<head[\s\S]*?<\/head>/gi, ' ')
    .replace(/<(script|style|template)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (all, e: string) =>
      e.startsWith('#x')
        ? String.fromCodePoint(Number.parseInt(e.slice(2), 16))
        : e.startsWith('#') && ENTITIES[e] === undefined
          ? String.fromCodePoint(Number(e.slice(1)))
          : (ENTITIES[e] ?? all),
    )
    .replace(/\s+/g, ' ')
    .trim()

export function testApp(options: HandlerOptions & { origin?: string }): TestApp {
  const { origin = 'http://localhost', ...rest } = options
  const handler = createHandler(rest)
  const page = async (response: Response): Promise<TestPage> => {
    const html = await response.text()
    const payload = /<script type="application\/json" id="hozu-payload">([\s\S]*?)<\/script>/.exec(html)?.[1]
    return {
      status: response.status,
      headers: response.headers,
      html,
      text: visibleText(html),
      payload: payload ? (JSON.parse(payload) as Json) : null,
    }
  }
  return {
    get: async (path, init) => page(await handler.fetch(new Request(origin + path, init))),
    post: async (path, form, init) =>
      page(
        await handler.fetch(
          new Request(origin + path, {
            ...init,
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded', ...(init?.headers ?? {}) },
            body: new URLSearchParams(form).toString(),
          }),
        ),
      ),
  }
}
