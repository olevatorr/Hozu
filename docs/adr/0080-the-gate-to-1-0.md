# ADR 0080 — The gate to 1.0, at no cost

- **Status:** accepted (owner, 2026-10-10: "1", choosing A + B + D with C as a bonus).
- **Context:** README "Requirements and status" said 1.0 follows a feedback round with engineers, non-engineers and
  designers, then the DevTools trial (ADR 0048). The owner will not recruit or pay people for a round ("我沒有要給外部
  回饋，我沒錢"). The gate has to be one Hozu can pass with what it has: agent trials, the owner's own work, and
  whatever the public sends.

## Options
| Source | What it proves | Cost | Limit |
|---|---|---|---|
| A. Agent trials in three roles | Whether the guide and tools serve users of different skill, end to end | The owner's existing agent subscription | Agents are not people: they rarely stall on concepts, setup or reading docs |
| B. The owner builds a real project with Hozu and ships it | Whether a real need, with real data, sign-in and a deploy, runs into a wall | The owner's time | One person, who knows Hozu |
| C. Unsolicited public feedback | Where a stranger stalls on first contact | None | Not guaranteed |
| D. The DevTools trial (ADR 0048) | Whether a DevTools request makes a change cheaper than the sentence alone | The agent subscription | One app, one model |
| Recruited people (the old gate) | The most direct evidence | Money and recruiting | Declined by the owner |

## Decision
1.0 release candidates start when all of these hold:
1. **A — trial 0026, three roles**, each building a small app from `npm create hozu` to a deploy, pre-registered in
   its own ADR before it runs:
   - *engineer*: an agent that may read anything a developer would (the guide, the app, the diagnostics);
   - *non-engineer*: a person simulated by a second agent that writes requests in plain words and judges the result
     only through `hozu browse` and screenshots, never through code; the building agent gets only those requests;
   - *designer*: changes made only through DevTools requests on a prepared app (this role shares its app with D).
2. **B — the owner's real project**, built with Hozu and deployed, with its friction recorded like a trial round.
3. **D — trial 0023 (ADR 0048)** run as pre-registered.
4. **No breaking change found** by A, B or D that is still open; the API is then frozen for the candidates.

C counts as a bonus: issues and posts from strangers are read, judged like any trial ask, and listed in the 1.0 notes.
`.github` issue templates make a report cheap to write.

## Consequences
- README's 1.0 line names this gate. ADR 0048's status points here instead of at a people round.
- The record says plainly that no people outside the owner tested Hozu before 1.0, if that is still true then.
