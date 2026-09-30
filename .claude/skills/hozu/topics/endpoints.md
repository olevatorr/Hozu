# Endpoints (webhooks, JSON APIs, auth callbacks)

```ts
export const orderHook = endpoint({ method: 'POST', path: '/api/hooks/order',
  input: z.object({ id: z.string() }), output: z.object({ received: z.string() }) })   // exported from model.ts
implement(orderHook, ({ id }, { request, session, setSession, env }) => ({ received: id }))   // in resolvers
```
- GET input comes from the query string, POST input from a JSON or form body; invalid input answers 400
  `{ message, fields }`. The output is validated and sent as JSON.
- `output: 'response'`: return a web `Response` yourself (redirects, headers); `setSession(value)` adds the cookie.
- `invalidates: (input) => [itemsTag()]` refreshes like a mutation's, when the endpoint succeeds (JSON, or a
  `Response` below 400). A GET endpoint with `invalidates` is HZ062 (warning).
- Paths are static and outside pages, redirects and `/_hozu/` (HZ046, with a patch). Cross-site browser POSTs are
  rejected; server-to-server calls (no `Origin`) are accepted. `hozu get /api/x` tries one without a server.
