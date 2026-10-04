# Endpoints (webhooks, JSON APIs, auth callbacks, downloads)

```ts
export const exportNotes = endpoint({ method: 'GET', path: '/api/export',        // exported from model.ts
  input: z.object({ format: z.enum(['json', 'csv']).default('json') }), output: z.object({ notes: z.array(Note) }),
  errors: { Unauthorized: z.object({ message: z.string() }) }, failed: { Unauthorized: 401 } })
implement(exportNotes, (input, { session, fail }) =>                             // in the app's resolvers
  session ? { notes: notesOf(session.user) } : fail('Unauthorized', { message: 'Sign in' }))
```
- GET input comes from the query string (coerced by the schema), POST input from a JSON or form body; invalid input
  answers 400. `fail(name, payload)` answers `failed[name]`; every declared error is mapped (HZ046).
- `output`: a schema (sent as JSON), `'redirect'` (return `redirect(ui.link(route, params))` from the context, 303) or
  `'response'` (a web `Response`, for files). Never HTML: a page is a `ui.page` (HZ053).
- Links: `ui.link(getEndpoint, input)` is the URL of a GET endpoint; `ui.form({ method: 'post', action:
  ui.link(postEndpoint) }, [...])` posts a native form, whose fields the input declares (HZ046).
- Paths are static and outside pages, redirects, `/_hozu/` and the derived `/sitemap.xml`, `/robots.txt` and
  `/manifest.webmanifest` (HZ046).

<!-- more -->

- Error bodies: invalid input is `{ error: 'Invalid', message, fields }`; a `fail` is `{ error, message, ...every field its error schema declares }`
  (statuses 400 401 403 404 409 410 422 429).
- `'redirect'` keeps the basePath. `'response'` is for files and protocol bodies that are neither JSON nor HTML. A
  `text/html` response is a 500 with HZ053: a page is a `ui.page` with `head.failed`.
- `input: 'raw'` (POST only) skips parsing and gives the resolver `bytes` (a `Uint8Array`), for signed webhooks.
- Headers and the raw request: the resolver's context has `request` (a web `Request`). A bearer token:
  `implement(postItem, (input, { request, fail }) => request.headers.get('authorization') === `Bearer ${token}` ? … : fail('Unauthorized', {}))`
  with `errors: { Unauthorized: z.object({}) }, failed: { Unauthorized: 401 }`. Try it from the DevTools API drawer
  (Endpoints: path, body and your own headers) or `curl`. Queries and mutations read no headers: identity is the session.
- `setSession(value)` works on GET too (auth callbacks); OIDC form_post callbacks use `output: 'redirect'`.
- `invalidates: (input) => [itemsTag()]` refreshes like a mutation's when the endpoint succeeds. A GET endpoint with
  `invalidates` is HZ062 (warning).
- A GET endpoint link takes flat scalar input (HZ035). Another feature links to an endpoint only when it is in
  `exports` and imported (HZ006).
- HZ046 for a path comes with a patch. Responses carry `nosniff` and a referrer policy. Cross-site browser POSTs are
  rejected; server-to-server calls (no `Origin`) are accepted.
- **What an endpoint cannot do yet:** methods are GET and POST; paths are static (a variable part goes in the
  input: `POST /api/bookings/cancel` with `{ id }`); a success answers 200; an error answers its status with
  `{ error, ...data }` (nested objects are fine, `error` is reserved); there are no custom response headers.
