# Measurement tools v2 (ADR 0044) and the trial 0020 rescore

## What changed
- **`bench/trial/anatomy.mjs`:** `anatomy(file)` is unchanged (v1, used by trials 0012–0020). `anatomy(file, { version: 2 })`
  classifies a Bash call by the leading command of each pipeline, skipping setup (`cd`, assignments, `sleep`, writes to
  `/tmp`); command substitutions in assignments count when they verify, serve or check. New category `serve` (start or
  stop the production server: `npm start`, `node serve.ts`, `hozu serve`, `kill`, `lsof`). `verify` covers `hozu browse`
  / `get` / `post`, `curl`, headless Chrome and CDP scripts, and python / node HTTP probes. v2 adds `verifyOrServe`
  (calls whose first tool verifies or serves, the primary verify metric) and `toolsBy`.
- **`metrics.mjs`:**
  - `hozu.hz018` / `hozu.hz057` / `hozu.diagnosticsSeen` count diagnostics printed by `hozu check` / `hozu validate`
    tool results (human or `--json`), with `blocking`, `identical` (was = now), `distinct` pointers and `runs`.
  - `hozu.lock` (`lock-state.mjs`) compares the lock committed at the step tag with the lock computed from that tag's
    source (a `git archive` copy; the trial app is never touched): `uncommittedNew` (copy-only entries never
    committed), `changedWithoutContract`, `orphan`, `stale`, with the ids.
  - `introduced` (failing checks that passed at the previous step) and `silentReview` (introductions in a session that
    did not end in error) are the silent-failure list for hand review. The keyword heuristic is only `silentHint`.
  - Removed: `silentFailure` (now `silentHint`) and `hz018Seen` (a text count). All other keys are kept.
  - Optional fifth argument: the directory with the transcripts (they are not committed); `TAG` / `PREV_TAG` override
    the step tags (`run.sh` passes `PREV_TAG=$FROM_TAG` for the first step).
- **`accept.mjs`:** new ids B3b (13), G2b (6–19), DA1b (17), N16 (0); `HOZU_HELDOUT` loads a held-out module
  (`heldout.mjs`, contract in `~/hozu-trial-0021/heldout/CONTRACT.md`); `vocab(k)` for k > 20 is step 20; N15 always
  runs last; an entry with a space (`hozu serve`) runs `node_modules/.bin/<bin>`.
- **`run.sh`:** `FROM_TAG`, `FROM_APP` (clone when the app is missing), `RESULTS`, `CHANGES`; the entry comes from
  `entry.mjs` (`hozu serve` when `scripts.start` is `hozu serve`, else `serve.ts`).
- **`report.mjs`:** `--results`, `--from`, `--to`, `--svg`, `--title`, `--metrics`; the defaults reproduce trial 0020's
  outputs byte for byte.
- **`verify-reference.sh`:** entry from `entry.mjs`; `EXTRA_STEPS="21"` runs more acceptance steps on the last state.
- **N16 and change 13:** `Selected: <n>` is specified as a with-JavaScript text, so N16 drops it from both texts from
  step 13 on (the Nuxt reference showed it only with JS; found in the reference replay, fixed before any run).
- **Tests:** `node --test bench/trial/longrun/tools.test.mjs bench/trial/longrun/heldout.test.mjs` (classifier cases,
  diagnostics counting, the loader against `test-fixtures/`).

## Trial 0020 rescored (`results/*/*/metrics-v2.jsonl`, steps 1–20)
- `./rescore.sh <raw results root>`: metrics v2 over the recorded acceptance results (v1 check ids). The new checks
  run on the 84 snapshots once, in the rescore after the wave-4 freeze (ADR 0044).

| Metric | hozu run1 | hozu run2 | nuxt run1 | nuxt run2 | ADR 0043 |
|---|---|---|---|---|---|
| HZ018 as text (v1 `hz018Seen`) | 36 | 37 | – | – | |
| HZ018 blocking diagnostics (identical was/now) | 12 (11) | 12 (11) | – | – | 12 (11) |
| … in steps 13–20 | 6 (6) | 6 (6) | – | – | 6 (6) |
| Copy-only entries never committed (max per tag) | 12 | 4 | – | – | 12 / 4 |
| Tags with a stale lock | 2, 3, 8, 9, 14, 15, 16 | 3, 9–12, 14 | – | – | |
| Behaviour changed without a contract change | 0 | 0 | – | – | |
| Silent failures, v1 keyword heuristic (steps) | 16, 18, 19, 20 | 20 | – | – | |
| Introductions for hand review (step: id) | 16: N15, 17: DA1 | 17: DA1 | – | – | 2 / 1 |
| Verify calls, v1 | 144 | 155 | 58 | 24 | |
| Verify calls, v2 | 150 | 165 | 35 | 27 | |
| Serve calls, v2 | 32 | 37 | 20 | 22 | |
| Verify or serve, v2 (primary) | 182 | 202 | 55 | 49 | |
| Docs calls v1 → v2 | 74 → 61 | 64 → 56 | 0 → 0 | 0 → 0 | |
| Read calls v1 → v2 | 81 → 58 | 81 → 64 | 39 → 38 | 45 → 46 | |
| Check calls v1 → v2 | 27 → 17 | 18 → 13 | 45 → 47 | 46 → 44 | |

- v1 counted every `HZ018` string, including `hozu docs contracts` and `changing.md`.
- v1 counted any command mentioning `curl`, `kill` or `npm start` as verify, and any `python3 -` heredoc as an edit.
  v2 moves server starts and stops to `serve`, and python HTTP probes to `verify`.
