# Trial 0003 — Fresh agents build and change the same app in Tenon and in Nuxt

Question (step 2 of trial 0002): does an AI that has never seen Tenon build and maintain an app more cheaply or
more correctly than with a mainstream framework? The decision on Phase 6 depends on the answer.

## Setup
- **Task**: a task board (`bench/trial/spec.md`): SSR list, add form with a server-side duplicate check,
  in-browser filters, a toggle that persists, a detail page with `<title>`, and a 404.
- **Change request** (`bench/trial/change.md`): task priority end to end, plus a "Clear done" mutation.
- **Arms**: Tenon (`examples/trial-tasks`) and Nuxt 4.5 (`bench/trial/nuxt`).
- **Starting point**: each arm got a blank, working scaffold with Tailwind wired.
- **Agents**: the same model, fresh context, one agent per step. They got the same instructions apart from the
  framework's documentation pointers and check commands.
- **Acceptance**: `bench/trial/accept.mjs` is a Playwright script the agents never saw. It checks the fixed DOM
  contract of the spec in a real browser. After the change it runs the new checks plus the full original suite
  again as a regression.
- **Metrics**: taken from the agents' transcripts.

## Results
| | Tenon build | Nuxt build | Tenon change | Nuxt change |
|---|---|---|---|---|
| Hidden acceptance | **12 / 12** | **12 / 12** | **6 / 6**, regression 12 / 12 | **6 / 6**, regression 12 / 12 |
| Assistant turns | 47 | 20 | 45 | 15 |
| Shell commands | 27 | 11 | 24 | 6 |
| Tool output read (chars) | 105,733 | 11,484 | 45,122 | 17,359 |
| Output tokens | 21,961 | 8,769 | 14,943 | 5,513 |
| Fresh input tokens | 198,017 | 39,747 | 80,238 | 36,456 |
| Cached input tokens read | 3.87 M | 0.97 M | 2.80 M | 0.72 M |
| Wall time | 3.9 min | 2.0 min | 2.7 min | 1.2 min |
| App source after the change | 24.0 KB (contracts 4.6 KB) | 11.0 KB | | |

Tenon cost **about 2.5–4× more on every token metric** and took about 2× the time. **Correctness was the same**:
both arms passed everything, and so did the regression suite after the change. The Nuxt agent also made its
forms work without JavaScript, which Tenon cannot do yet (ADR 0011, Tier 1 item 5).

## Where Tenon's cost came from
1. **Learning**:
   - Before writing any code, the build agent read three examples, three ADRs and then the framework *source*
     (`ui.ts`, `op.ts`, `fn.ts`), because the docs did not answer its questions.
   - The change agent (also fresh) read framework source again: the invalidation builder, the adapter's tag
     handling and the client runtime.
   - Nuxt needs none of this; the model already knows it.
2. **Busy states duplicate the UI (TN005)**:
   - Every control that sends an event must be handled in every state where it is visible.
   - Handling an event in a busy state would re-run the invoke, and there is no way to say "ignore this event
     here".
   - So the agent rendered every control twice: once live in `idle`, once disabled in `adding` / `toggling`.
     This is the largest single source of extra code.
3. **DOM strings to enums**: a `<select>` value arrives as `string`, so choosing a priority took three guarded
   transitions, following the showcase's pattern.
4. **Coarse invalidation**: `invalidates` can read only the mutation input. "Clear done" cannot name the deleted
   ids, so every detail query got the list-wide tag.
5. **Contracts**: 4.6 KB of the 24 KB. They are required (TN016), and they did not find a defect in this trial
   because the agents made none that the acceptance suite detected.
6. **Undocumented details**:
   - filtering a query result by machine state (`fn` as an `each` source)
   - the `/_tenon/effect` request shape that the agent needed for curl

## Framework defect found and fixed
The detail page (no machine) shipped `client.js` and the whole feature machine. `planRoute` collected the
mutations that all of the page's features *could* invalidate, even from features whose machine is not bound on
that page. Only machine-bound page views count now. The page ships 0 JS again, as principle 8 requires.
Regression test: `packages/compiler/test/plan.test.ts`.

## What trial 0002's step 1 changed here
Nothing observable. Neither agent wrote a literal value outside its schema. This confirms the user's point that
character typos are not how AI fails. The fresh agents' real friction was learning cost and expressiveness, not
invalid values.

## Verdict
**Not confirmed.**
- At this scale Tenon does not make AI development cheaper; it costs 2.5–4× more tokens.
- It is not more correct either; correctness was equal.
- The verification layer caught problems during the Tenon agents' own iterations: a TypeScript error on a possibly
  undefined access, and TN005 forcing a decision about busy states. It prevented no defect that reached
  acceptance in either arm.

Limits: one run per arm, one small app, the same model for both arms. Verification may pay off on larger apps
and over longer maintenance. This trial does not show that, and it shows the price clearly.

## Recommendation
Do **not** start Phase 6 (ADR 0011). What decides the question is Tenon's cost for an AI, not the number of
features it has. Two directions, for the user to choose:

- **A. An "AI ergonomics" phase, then re-run this trial.**
  - Target: build ≤ 1.3× Nuxt's tokens, change ≤ 1.0× Nuxt's tokens, same acceptance.
  - Measures:
    - one compact reference doc for agents (API plus the patterns found missing here), so no source reading is
      needed
    - a declared "ignore in state", or derived `disabled`, to remove the busy-state duplication
    - DOM values parsed against an event's enum
    - `invalidates` able to read the mutation output
  - If the re-run misses the target, stop.
- **B. Change the authoring surface.** Keep the IR, validator, contracts and render planning, but author in a
  syntax models already know (for example a constrained subset of Vue SFC or TSX) and compile it to the IR.
  - Removes most of the learning cost.
  - A much larger change: principles 1 and 4 would need restating around a restricted familiar syntax.
