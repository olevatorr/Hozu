import type { Diagnostic, Json } from '@hozu/core/ir'
import {
  type App,
  type AppHost,
  appHandlerOptions,
  createHandler,
  type HandlerOptions,
  type OgCard,
  type SessionStore,
  usedClientComponents,
} from '@hozu/runtime-server'

export interface TestPage {
  status: number
  headers: Headers
  html: string
  text: string
  payload: Json | null
}

export interface TestApp {
  get(path: string, init?: RequestInit): Promise<TestPage>
  post(path: string, form: Record<string, string> | [string, string][], init?: RequestInit): Promise<TestPage>
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

export interface TestAppOptions {
  origin?: string
  session?: SessionStore
  env?: AppHost['env']
  og?: ((card: OgCard) => Promise<Uint8Array>) | null
}

export class BuildErrors extends Error {
  override name = 'BuildErrors'
  readonly diagnostics: Diagnostic[]
  constructor(diagnostics: Diagnostic[]) {
    super(
      `The build has ${diagnostics.length} error${diagnostics.length === 1 ? '' : 's'}, so nothing is rendered:\n${diagnostics
        .map((d) => `  ${d.code} ${d.location.pointer} ${d.message}`)
        .join('\n')}`,
    )
    this.diagnostics = diagnostics
  }
}

export function testApp(
  app: App,
  { origin = 'http://localhost', env, session, og }: TestAppOptions = {},
): TestApp {
  const rest: HandlerOptions = appHandlerOptions(app, {
    ...(env ? { env } : {}),
    ...(session ? { session } : {}),
  })
  if (og !== undefined) rest.og = og
  const errors = rest.build.diagnostics.filter((d) => d.severity === 'error')
  if (errors.length) throw new BuildErrors(errors)
  const handler = createHandler(
    rest.components || rest.manifest
      ? rest
      : {
          ...rest,
          components: {
            urls: Object.fromEntries(
              usedClientComponents(rest.build.ir).map((ref) => [ref, `/_hozu/c/${ref}.js`]),
            ),
            files: {},
          },
        },
  )
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
