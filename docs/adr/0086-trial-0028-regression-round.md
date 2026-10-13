# ADR 0086 — Trial 0028: does a new app avoid what Mori met? (pre-registration)

- **Status:** accepted and run (owner, 2026-10-13: "可以繼續做測試了，直接做到完不用問我意見，然後再統整給我，記得不要花到額外費用").
  No paid or external service: agents on the owner's subscription, local Docker only.
- **Question:** releases 0.29–0.30.1 fixed what the Mori rebuild and trial 0023 met. With Hozu 0.30.1 from npm, do
  those fixes hold when an agent that never saw them builds a different app, and does the DevTools request for the
  behaviour change that failed in trial 0023 (change 9, arm B) now pass?

## R1 — an engineer agent builds a new app
- **App (brief):** a small pet-grooming studio.
  - A public site with a shared header whose mobile menu is a fixed drawer, a services page, and an about page in
    long-form prose (Tailwind typography).
  - A back office for two roles. Staff see bookings. Admins also see prices, staff accounts and a revenue chart, which
    is a client component.
  - Pet photos are uploaded from the booking page, and the total of a booking line is price × quantity.
  - A kit with a plain project class used beside colours.
  - Data in a JSON file or memory (demo stand-ins). The app is deployed with `hozu build --target node`,
    `docker build` and `docker run`.
- **Who:** one isolated agent (`claude-opus-5-5`), with only `npx create-hozu@0.30.1 --agent claude` and the guide it
  writes. It does not read the framework repository.
- **Recorded:** steps done / done after a retry / not done; every diagnostic and whether its printed fix was
  followed; every workaround of the framework; tool calls.
- **Probes (read from the run and checked by the lead afterwards):**

| # | Probe | Fixed in |
|---|---|---|
| 1 | The mobile drawer is drawn above the page (`hozu browse` at 390 px clicks inside it) | 0.29 A1 |
| 2 | The plain project class beside a colour survives the kit's class merge | 0.29 A2 |
| 3 | `*` works in a callback | 0.29 A3 |
| 4 | Staff never see admin links or admin pages | 0.30 A1 |
| 5 | Uploads reach the resolver, guided by the recipe; `hozu browse` can upload | 0.30 A4, A6 |
| 6 | The container starts on its first `docker run`, client component and typography included | 0.30.1 A1, A2 |

- **Pass:** probes 1–6 hold, the container answers its pages, and no framework rule is worked around. Every friction
  is judged like earlier trials (accept / modify / decline by principle).

## R2 — trial 0023 change 9 again, arm B
- The frozen studio app is upgraded to 0.30.1. The request for change 9 is saved again through the real DevTools
  overlay by the same script and path. Two isolated runs follow the arm-B prompt ("Do the open Hozu requests.").
- The acceptance check is trial 0023's hidden check for change 9, unchanged. This is a confirmation reported beside
  trial 0023, not a change to its registered result.

## Rules
- Ports 4930–4949 only; never 3000, 3100, 3101, 4901, 4902; no `hozu dev` except the lead's request-saving run
  (port 4940).
- Records: `docs/trials/0028-regression-round.md`.
