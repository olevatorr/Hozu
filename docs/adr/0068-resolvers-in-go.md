# ADR 0068 — Resolvers in Go: the IR as a cross-language contract

- **Status:** proposed, implemented on `feat/go-resolvers` for review (owner, 2026-10-08: "希望妳能提案這個全端框架後端推薦
  後端使用的語言，我自己傾向Go … 要知道這是ai-first全端框架"; after the spike: "照你建議，你可以跑看看驗證嗎？如果沒問題再正式提案給我";
  after this ADR: "可以先寫，我在交由主agent定奪"). Not in a release; the main line decides whether and when.

## Context
"The backend" in Hozu is two different things:

| Layer | What it does | Must match the browser? |
|---|---|---|
| runtime-server, machine, render, `fn`, CLI | records the IR, renders, runs the machine for no-JS posts, ships `fn` source, `'either'` effects, edge entries | yes: the same code runs on both sides (ADR 0004, 0007 D5, 0024, 0049) |
| resolvers (`implement(decl, run)`) | read and write data behind `runs: 'server'` queries, mutations and endpoints | no: they get validated input and a session, and return output or a declared error |

Moving the first layer to Go would mean two implementations of one concept (principle 1) and losing the edge and
`'either'`. The second layer is ordinary backend code, bound by declaration identity and typed by JSON Schema the IR
already holds: its contract is language-neutral already.

A Python CLI was also raised. The CLI loads `hozu.config.ts` through `@hozu/transform` and calls the TS packages; an
agent reads its `--json`, not its source. Python would add a second runtime to every install and a copy of the IR
types, for no gain to the agent. Rejected.

## Options
| | Option | For | Against |
|---|---|---|---|
| A | TypeScript only (today) | one type system from schema to resolver | teams with Go services wrap them by hand in `fetch` |
| B | runtime-server in Go | throughput, one binary | ~20 packages twice; machine / `fn` / render kept identical in two languages; no edge, no `'either'` |
| **C** | **TS runtime; resolvers optionally in Go, from a contract generated from the IR** | Go where it is strong; the IR stays the only source of truth | a process boundary; the session crosses it; generated code can go stale |
| D | CLI in Go or Python | — | the type checker is already Go (TS 7); the rest needs the TS packages |

## Decision (proposed): C
TypeScript stays the framework, the CLI and the default resolver language. Go is an optional resolver language for
`runs: 'server'` effects.

### R1 — `remote(options, decls)` in `@hozu/data`
```ts
resolvers(project, (implement) => [
  implement(me, …),
  ...remote(
    {
      url: { env: 'NOTES_SERVICE_URL' },          // or a literal URL
      secret: { env: 'NOTES_SERVICE_SECRET' },    // sent as x-hozu-secret
      contract: new URL('./service/hozu/contract.go', import.meta.url),
      // timeout: 10_000
    },
    [listNotes, addNote],
  ),
])
```
- An implementation like any other (bound by declaration identity), so HZ021 (missing / twice) and every runtime rule
  apply unchanged. `access` runs in the Hozu server before the call; the answer is checked against the output and
  error schemas as for a TS resolver (`runtime.ts`), so a wrong service fails closed as `Unexpected`.
- A call is `POST { effect, input, session }` with `x-hozu-fingerprint`; the answer is `{ ok }` or
  `{ fail: { name, data } }`, plus `session` when it changed (`null` = signed out). Public queries never send the
  session (ADR 0005). A 409 (another contract) or any non-2xx is `Unexpected` naming the cause.
- The URL and secret are read from the server env, which must declare them (HZ093), so `hozu env` lists them.

### R2 — `hozu gen`
Writes the contract of every `remote()` to the file its `contract` names (the folder is the Go package): one struct
per schema, one error type per declared error (`NotesAddNoteDuplicate`), `Invalid`, `Ctx` (`Session`, `SetSession`,
`SignOut`), the `Resolvers` interface (one method per effect, sorted, with its kind, session and errors) and
`Handler(r, Options{Secret})`. Output is gofmt-clean and needs only the standard library (Go 1.22).
- A schema with `.meta({ title: 'Note' })` is one Go type wherever it appears; other objects are named by position
  (`NotesAddNoteInput`); `{}` is `Empty`. Sharing by shape alone was tried and rejected: it named `removeNote`'s
  output `NotesRemoveNoteInput`.
- `z.int()` is `int64`, a plain number `float64`; a list never answers `null` (the handler fills nil slices).
- The path in app.ts is the one place the contract is named, so the command takes no arguments.

### R3 — HZ093 `remote-contract`
Error. `hozu check`: the contract file is missing, not `.go`, or its `Fingerprint` differs from the declarations'.
The data runtime (so the server refuses to start): a remote effect that is not `runs: 'server'`, an endpoint that is
not JSON (`'redirect'`, `'response'`, `input: 'raw'`), or an env variable `remote()` reads that the server env does
not declare. The fingerprint is `hashJson({ session, effects })` over exactly the listed effects
(`remoteContract` in `@hozu/core/ir`), so changing an effect implemented in TypeScript never stales a Go contract.

### R4 — guide and example
`hozu docs data --more` gains "Resolvers in another language (Go)": when to choose it (asked for, or the service
exists), the loop (declaration → `hozu gen` → `go test` → restart → `hozu check`) and the Go idioms. SKILL.md is
unchanged (4 087 of 4 096 B). `examples/notes-go` is `examples/notes` with every resolver in Go (`service/`).

### Unchanged
Declarations, `access`, caching, tags, invalidation, the lock and contracts. `hozu call`, `hozu browse` (`hold`
included), DevTools and `hozu why` work as before: they go through the Hozu server, which makes the call.

## Evidence
- **Spike** (scratch copy of `examples/notes`): a Sonnet agent given only the generated contract and the TS
  behaviour wrote 229 lines of Go; `gofmt`, `go vet`, `go build`, `go test` passed on the first run. Its friction
  (three Go types for one `Note`, `float64` counts, possible `null` lists, `Invalid` undocumented) is fixed in R2.
- **Acceptance:** `bench/trial/notes/accept.mjs` (real Chrome, with and without JS, two users at once) passes
  **21/21** on `examples/notes-go` with `service/` running, as on `examples/notes`.
- **Tests:** `packages/data/test/remote.test.ts` (call shape, fingerprint and secret headers, no session for public
  data, declared error and session mapping, schema check on the answer, 409, the three runtime HZ093 cases, the
  fingerprint following the declarations); `packages/cli/test/remote.test.ts` (the committed contract equals what
  `hozu gen` writes, a changed declaration is HZ093 until `hozu gen`, a missing contract, gofmt, `go vet` and
  `go test` of the example service when Go is installed).
- **Cost** — `node --import ./packages/transform/dist/register.js bench/remote/run.ts` (data runtime calls, Apple M4
  Pro 12 cores, Node 22.22, Go 1.26; rounds 2–3; not part of the gate):

  | Workload | Concurrency | TypeScript req/s | Go req/s | p50 TS / Go |
  |---|---|---|---|---|
  | echo (boundary only) | 1 | ~600 000 (in-process) | ~12 000 | 0.00 / 0.07 ms |
  | echo | 32 | ~1 200 000 | ~18 400 | 0.02 / 1.6 ms |
  | aggregate 20 000 rows (CPU) | 1 | ~560 | ~3 400 | 1.75 / 0.28 ms |
  | aggregate 20 000 rows | 32 | ~540 | ~14 400 | 58 / 1.9 ms |
  | 10 upstream calls × 20 ms (I/O) | 32 | ~1 450 | ~1 410 | 21 / 22 ms |

  The boundary costs ~0.07 ms per call. CPU work in a resolver is where Go wins (6× alone, ~27× under load, because
  Node runs resolvers on one core); waiting on other services is a tie. Through the whole server (`/api/notes`,
  trivial resolvers) the spike measured ~15 300 → ~8 500 req/s: Go only pays off when the resolver does real work.

## Risks
| Risk | Mitigation |
|---|---|
| ~0.07 ms and a second process per call | TS stays the default; the guide says when Go is worth it |
| Contract drift | fingerprint in the file (HZ093) and on every call (409) |
| A direct call to the service skips `access` | private address plus `secret` (constant-time compare in `Handler`) |
| Two toolchains for an agent | one loop in `hozu docs data --more`; `hozu gen` prints the next step |
| `go` absent on a machine | the CLI never needs Go; the example's Go test is skipped |

## Not done (for the decision)
- No `hozu add` for a Go service; `go.mod` is the person's.
- Other languages: the protocol is JSON over HTTP with JSON Schema, so a Python generator is a later ADR.
- No CLAUDE.md / CHANGELOG / site entry and no version bump: they come with the release that takes it.
