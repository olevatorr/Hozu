# ADR 0013 — AI ergonomics: a Tenon skill, declared ignores, checked DOM text

- Status: accepted (the user chose direction A from trial 0003: "照A做，做完重跑實驗，其實就是要給他skill")
- Goal: a fresh agent should build the trial app with ≤ 1.3× Nuxt's tokens and change it with ≤ 1.0× Nuxt's
  tokens, with the same hidden acceptance. The trial is re-run afterwards; if Tenon misses the goal, the
  direction is stopped.

## Cost drivers from trial 0003 and the decisions
| Driver | Options | Decision |
|---|---|---|
| Learning: agents read examples, ADRs and framework source (106 K chars before writing) | (a) longer CLAUDE.md; (b) generated API docs; (c) **a skill**: one task-shaped reference loaded on demand | **(c)** `.claude/skills/tenon/SKILL.md`: the mental model, file layout, every builder with its signature, the patterns the agents had to reverse-engineer, the checks, and a diagnostic table. Every snippet is type-checked and validated before publishing. |
| Busy states duplicate every control (TN005) | (a) relax TN005; (b) internal transitions that do not re-enter; (c) **declared ignores** | **(c)** `ignore: [Event, …]` on a state: the event is explicitly dropped there. The runtime already drops unhandled events, so no client code changes. TN005 accepts a state that ignores the event, and its fix now offers the ignore patch. Ignoring an event the same state also handles is **TN034** (conflicting-ignore). (a) would hide real mistakes; (b) changes ADR 0004 semantics and contracts. |
| A `<select>` value is `string`, so enum fields need one guarded transition per option | (a) a new `ui.dom.choice` field (an alias, against principle 1); (b) a runtime check against the schema (client bytes; P7 has 13 B headroom); (c) **type DOM text loosely and check it statically** | **(c)** `ui.dom.value` and `ui.dom.form(name)` may flow into any payload field in TypeScript. **TN033** (unchecked-dom-text) checks the flow in the validator: into an enum only from a `select` (or radio inputs of that name inside the form) whose literal option values are all members; into a number only through `ui.dom.valueAsNumber`; into a boolean only through `ui.dom.checked`. |
| Invalidation can read only the mutation input | output-based tag params | Deferred: the workaround (a list-wide tag) cost little. Revisit if the re-run shows it. |

## Consequences
- `StateIR` gains `ignore: string[]` (event refs, sorted). The machine runtime is unchanged.
- The new codes need registry entries, rules, fixes and catalog cases:
  - TN033 unchecked-dom-text
  - TN034 conflicting-ignore
- The trial app is rebuilt from the blank scaffold by fresh agents that are pointed at the skill. The Nuxt arm is
  re-run too, to measure run-to-run variance.

## Iteration 2: the change path (after trial 0004)
Trial 0004 met the build target (0.82× Nuxt) but missed the change target (1.62×). The user chose to iterate
once on the change path.

- **The skill is split by task.**
  - `SKILL.md` is the core API.
  - `changing.md` is new: what to read, where each kind of change goes, and the check / verify loop.
  - `patterns.md` and `diagnostics.md` are read only when needed.

  A change agent reads the core and `changing.md` instead of everything.
- **TN016 prints a ready contract instead of a skeleton.** It is filled from the *declarations*:
  - the initial context;
  - schema-derived example payloads, results and error data;
  - the transition's declared target;
  - the effect the target state invokes.

  Assigned context paths are listed for the author to decide. The machine is not run to fill in expected
  values, because that would turn contracts into snapshots of observed behaviour (CLAUDE.md: never edit a
  contract just to match observed behaviour).
