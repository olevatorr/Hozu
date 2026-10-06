# ADR 0064 — 0.20: simple requests stay simple

- **Status:** accepted (owner, 2026-10-06: "可以，開0.20.0 … 順便檢查有沒有其他的會導致Ai會無意把簡單的需求複雜化";
  on JavaScript: "我不能接受為什麼不要有JS？很多就是需要JS … 不能限制Ai而是這框架Ai做的時候可以適時提醒真的有問題的東西";
  scope: docs fixes + `is()` + `copy`; P7 budget 9 KiB).
- **Source:** a stock dashboard needed "auto-refresh every 30 s with Pause / Resume / Refresh now"; 0.19's
  `freshness: { poll }` could not be paused or triggered, so the agent wrote a machine timer and a no-op mutation whose
  only job was `invalidates`. An audit then walked fifteen common small requests through the guide.

## Principle — warn about real problems, never steer away from JavaScript
Hozu ships 0 JS for what does not interact; that is a free result, not a goal. A diagnostic warns when something will
break or leak (data reaching the wrong visitor, a cached user region, a machine that cannot leave a state), not when
a feature needs JavaScript. The guide verifies the normal case first and checks without JavaScript only when the
request asks for it. The guide does not say what is allowed (an agent writes it anyway); it says only what to watch
for (owner, 2026-10-06: "可以的東西就不用寫 … 多寫那句感覺是躁點").

## A — `refresh` on a transition
- **Options:** a transition effect `refresh: () => [tag()]`; `freshness: { poll, when }` (a query declaration would
  read view state, and two forms would exist for one need).
- **Decision:** `refresh` (any transition: an event, `done`, `failed`, `after`) reads again the queries on the page whose
  tags it names: browser-run ones through the page's runner, server-run ones through `/_hozu/effect` with the framework
  effect `%refresh` (no write, no invalidation, no broadcast; the answer follows the query's freshness). Contracts expect
  `{ refresh: [tag()] }`; the lock prints `refresh tag`. `poll` stays for "always fresh"; `refresh` for refreshes the
  person controls (Pause / Resume = two states and an `after` timer).

## B — HZ036 only where a form can be fixed
- **Decision:** a form whose submit starts a `runs: 'browser'` mutation needs JavaScript by design: no HZ036. HZ036 stays
  for a form that reads other DOM values, which `ui.dom.form(name)` can fix. `hozu browse` defaults to `--js on`;
  `--js both` is for a change that must also work without JavaScript. Accept entries for HZ036 on browser mutations
  become HZ087 (stale); the CHANGELOG says to delete them.

## C — `is([...])` in a render
- **Problem:** a disabled or `aria-busy` button while saving needed a context field mirroring the machine state.
- **Decision:** a bound view's render receives `is(['saving'])`, a condition that is true in those states (the IR reads
  the machine state as `{ ref: 'state' }`). `when` stays the structure form (it has motion); `is` is for values.

## D — `copy` on a transition
- **Decision:** `copy: (arg) => text` writes text to the clipboard after the transition (a framework effect like
  `navigate`); contracts expect `{ copy: 'text' }`. No client component or no-op mutation.

## E — guide fixes (no API)
- Dialogs, popovers and menus: native `command` / `commandfor`, `popover` / `popovertarget`, `<dialog closedby>`,
  `<details>` (0 JS, 0 declarations) before any machine state.
- A toast while the page stays usable: put the controls in `machine({ on })`; HZ005's fix suggests handling the event
  (or `machine({ on })`) before `ignore`.
- SKILL.md: the visitor's own drafts and preferences go to the browser without asking; `+=` counts as a computed value.
- Dark mode: Tailwind's `dark:` follows the system with no code; a manual switch is a client component.
- `--js both` and HZ036 wording as in B.

## F — an `on` without `target` stays
- **Problem:** every transition to its own state entered it again, and a machine-wide `on` without `target` counted as
  one: a Copy click restarted a 30 s refresh timer, typing (a shared `assign`) kept a toast from closing, and a busy
  state could not take a targetless event. Modern state machines (XState v5) and plain `setInterval` code do not
  behave that way, so agents and people expect otherwise (owner: "如果不符合UX或者原本現代框架的行為，就必須改").
- **Decision:** an `on` without `target` (in a state or in `machine({ on })`) stays: no new entry, its timers keep
  running, an `invoke` keeps going (IR `stay: true`; the lock prints `--> stays`). Naming the state, even its own,
  enters it again: a debounce or a repeating timer says so explicitly. `done`, `failed` and `after` still name their
  state (HZ014). Apps whose shared `on` entries fired in states with timers change for the better; their lock entries
  show the change and `hozu check --update-lock` accepts it.

## Budget
P7 (initial client JS) rises from 8 KiB to 9 KiB: interaction is what the client runtime is for, and 8 KiB blocked
ordinary features. The bench still reports the exact value.

## Later (0.21)
A draft that survives a reload without a client component, `ui.format.ago` that updates, keyboard shortcuts with
`preventDefault` and focus.
