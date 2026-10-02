# Contributing to Hozu

Thank you for helping. Hozu is maintained by one person, who reviews and merges every change.

## Before you start
- **Bugs:** open an issue with the smallest app or command that shows it, and what you expected.
- **Features and API changes:** open an issue first. A change to the authoring surface, the IR or a diagnostic needs
  an ADR in `docs/adr/` before code (see [`CLAUDE.md`](CLAUDE.md), "Workflow rules").
- **Security problems:** do not open an issue; see [`SECURITY.md`](SECURITY.md).

## Making a change
1. Fork the repository and branch from `main`.
2. Read [`CLAUDE.md`](CLAUDE.md): the principles there are not negotiable, and coding agents read it too.
3. Keep the change small and focused. Match the surrounding code; minimal comments.
4. A behaviour change comes with a contract (given / when / expect) or an accepted lock diff.
5. A new diagnostic code needs a registry entry, a rule, a fix and a mistake-catalog case.
6. An API change updates the skill (`.claude/skills/hozu/`) and `examples/bookmarks`; run `pnpm skill`.
7. Run `pnpm gate` (Node 22.18 or newer, pnpm through corepack). It must be green.

## Opening a pull request
- Describe what changed and why, and paste the end of the `pnpm gate` output.
- Pull requests from first-time contributors wait for approval before any workflow runs.
- The maintainer may ask for changes, or decline a change that does not fit the design. Merging is the maintainer's
  decision.

By contributing you agree that your work is released under the [MIT license](LICENSE).
