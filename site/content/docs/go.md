---
title: Resolvers in Go
description: Implement server queries and mutations in a Go service while the Hozu server keeps access, caching and checks.
order: 8
---

## When to use it

TypeScript resolvers in `app.ts` are the default: they need no second process. Move effects to Go when the person asks for it, or when the service that owns the data is already written in Go.

`remote()` from `@hozu/data` sends `runs: 'server'` queries, mutations and JSON endpoints to a service over HTTP. Everything else stays in the Hozu server: `access`, caching, tags, invalidation and the check of each answer against its output schema. A wrong answer from the service is `Unexpected`, never a wrong page. Browser-run effects and non-JSON endpoints cannot be remote (HZ093).

## Name the service in the app module

```ts
// app.ts
import { remote, resolvers } from '@hozu/data'
import { app } from '@hozu/runtime-server'
import project from './hozu.config.ts'
import { me } from './features/account/model.ts'
import { addNote, listNotes } from './features/notes/model.ts'

export default app({
  resolvers: resolvers(project, (implement) => [
    implement(me, (_, { session }) => ({ name: session?.user ?? '' })),
    ...remote(
      {
        url: { env: 'NOTES_SERVICE_URL' },
        secret: { env: 'NOTES_SERVICE_SECRET' },
        contract: new URL('./service/hozu/contract.go', import.meta.url),
      },
      [listNotes, addNote],
    ),
  ]),
})
```

Declare both variables in `env.server` ([Environment](/docs/environment)). The secret is required, at least 16 characters, and the same value on both sides: the service trusts the session each call carries, so it must answer only the Hozu server. `timeout` (10 000 ms by default) bounds a call before it answers `Unexpected`.

## The loop

1. Change the declaration in TypeScript.
2. Run `npx hozu gen`. It writes the contract named in `remote()`: the Go types, a `Resolvers` interface with one method per effect, and `Handler`. It uses only the standard library and is gofmt-clean.
3. Implement the interface until `go test ./...` passes.
4. Restart the service, then run `npx hozu check`.

A contract older than the declarations is HZ093, naming the effects that changed. Each effect has its own fingerprint, so a running service built from the older contract answers 409 only to calls of those effects.

## Write a resolver

```go
func (r *resolvers) NotesAddNote(ctx *hozu.Ctx, in hozu.NotesAddNoteInput) (hozu.Note, error) {
	text := strings.TrimSpace(in.Text)
	if r.exists(ctx.Session.User, text) {
		return hozu.Note{}, hozu.NotesAddNoteDuplicate{Text: text}
	}
	return r.add(ctx.Session.User, text), nil
}
```

- **Declared errors** are Go values: return `hozu.NotesAddNoteDuplicate{…}` as the error, and `hozu.Invalid{Message, Fields}` for input problems. They reach `failed` as they would from TypeScript.
- **Any other error** answers 500 with its first line. It reaches `onError` and `Unexpected` with the call's id, the `x-hozu-call` header that the service's log line also names: `hozu: notes.listNotes (call 3fa2c1d0): …`. A service that is not running is reported as `no service answers at <url>`.
- **The session:** `addNote` declares `access: 'signedIn'`, so the Hozu server refuses a signed-out call before it reaches the service and `ctx.Session` is set. Without such an access rule `ctx.Session` is nil when the visitor is signed out. Mutations and endpoints sign in with `ctx.SetSession(hozu.Session{…})` and out with `ctx.SignOut()`. Public queries never receive the session.
- **Also on `ctx`:** `ctx.File(token)` reads an upload, `ctx.Header` holds an endpoint's request headers (no cookie), `ctx.Preview` is true in preview mode, and `ctx.Context` ends with the call.

## Types

- `.meta({ title: 'Note' })` on a schema makes it one Go type wherever it appears; without a title, each place gets its own.
- A string `z.enum` is a named type with one constant per member, such as `hozu.OrderStatusPending`, named by its title or its field. `hozu gen` notes untitled enums with the same members.
- `z.int()` is `int64`, any other number `float64`; `hozu gen` notes number fields that look like ids or counts.

## The service

Besides the resolvers, a service needs only a `main.go` (`go.mod` is yours; the contract's folder is the `hozu` package):

```go
func main() {
	secret := os.Getenv("NOTES_SERVICE_SECRET") // the app's remote() secret, 16+ characters
	addr := os.Getenv("NOTES_SERVICE_ADDR")     // the app's NOTES_SERVICE_URL is http://<addr>/effect
	mux := http.NewServeMux()
	mux.Handle("/effect", hozu.Handler(newResolvers(), hozu.Options{Secret: secret}))
	server := &http.Server{Addr: addr, Handler: mux}
	go func() {
		if err := server.ListenAndServe(); !errors.Is(err, http.ErrServerClosed) {
			log.Fatal(err)
		}
	}()
	stop, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()
	<-stop.Done() // finish the calls in flight, then exit
	ctx, done := context.WithTimeout(context.Background(), 5*time.Second)
	defer done()
	server.Shutdown(ctx)
}
```

`hozu.Handler` refuses to start without a secret. Serve it on a private address, deploy it with the Hozu server, and run `hozu gen` and rebuild it whenever a remote declaration changes ([Deploying](/docs/deploying)).

## The reference app

[`examples/notes-go`](https://github.com/olevatorr/Hozu/tree/main/examples/notes-go) is the notes app with every resolver in Go: sign-in, per-user notes, an admin list, an endpoint and bulk actions, with `go test` beside them. `npx hozu docs data --more` prints the same loop for your agent.
