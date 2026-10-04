# ADR 0054 — Declared access: who may read and change what (draft)

- **Status:** decided (owner, 2026-10-04): option A, missing access is an error, the query row check reports. Built in 0.15 (ADR 0056 B).
- **Problem:** a user seeing another user's data is the most damaging mistake an agent makes in a web app, and the
  most common one.
  - Every trial's hidden acceptance tests per-user isolation for exactly this reason (trial 0012, trial 0020).
  - Today Hozu checks that `scope: 'user'` data never reaches a cacheable region (HZ023, HZ049). Who may read which
    rows is plain resolver code (`where userId = session.user`). The validator cannot see it, a contract cannot test
    it, and forgetting it type-checks.
- **Goal:** make missing access control structurally hard to write and cheap to verify. This is the north star
  applied to authorization.

## Options
| | Option | For | Against |
|---|---|---|---|
| A | **Declared access on effects:** `query({ …, access: owner((row) => row.userId) })`, `mutation({ …, access: signedIn() })`, `access: role('admin')`; the runtime applies it (filters rows, refuses with a declared `Forbidden`) | The validator can require an access rule on every `scope: 'user'` effect; contracts and `hozu call --session` can test it; the rule is data, so tools can list it | Real rules (shared notes, teams, invitations, delegation) outgrow simple helpers; needs an escape hatch |
| B | Access in the resolver, with a required declaration: `access: 'checked-in-resolver'` plus a test | Flexible; small change | Declares that a check exists, not what it does; nothing is verified |
| C | Row-level policies in a declared data layer (tables with owners), resolvers query through it | Strongest guarantees; invalidation tags could be derived from table writes too | Becomes an ORM / data layer; large scope and many design choices |

## Leaning (not decided)
**A, with a typed escape hatch.**
- **Helpers:**
  - `owner(row => row.userId)` covers single-owner data;
  - `member(row => row.teamId, session => session.teams)` covers membership;
  - `role(…)` and `signedIn()` cover the rest of the common cases.
- **Escape hatch:** `custom(fn)` is a named, schema-typed `fn` that receives `{ session, row | input }` and returns a
  boolean. It is self-contained like every `fn`, and it is listed by the tools.
- **New diagnostics:**
  - an error: a `scope: 'user'` query or a mutation without `access`;
  - a warning: `access` on public data.
- **Reads:** for list queries, the runtime filters the resolver's rows by `access`. A row-level filter after the
  fact is a safety net; resolvers should still query narrowly.
- **Writes:** `access` is checked against the input, or the loaded row, before the resolver runs.
- **Test support:**
  - `hozu call --session` against two users;
  - a generated contract-like check, "user B cannot read A's row", for every owner rule.

## Open questions for the owner
1. Should every `scope: 'user'` effect be required to declare access (error), or should it start as a warning?
2. Should filtering rows after the resolver be in scope, given that it can hide a slow, over-broad query?
3. Should option C (a declared data layer) be considered for a later release together with derived invalidation?
