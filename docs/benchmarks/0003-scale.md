# Benchmark 0003 — Hozu at 50, 200 and 500 features (ADR 0050 phase 0)

Run with `pnpm bench:scale [sizes…]` (local only, not part of `pnpm gate`). Source: `bench/scale`.

## Setup
`bench/scale/app.ts` writes a real app per size into `bench/scale/out/<n>` (git-ignored). Each feature has:
- one page;
- one machine with a guard, two `invoke` states and a timer, plus one contract;
- two queries (`'static'` and `{ revalidate: 60 }`), two mutations and one tag;
- two `fn`s that share a module helper;
- a view with a no-JS form, filter buttons and a 100-row `ui.each` list with a button per row.

The resolvers in `app.ts` hold 100 rows per feature.

Measured on the owner's development machine (Apple silicon, Node 22.22.2, TypeScript 7.0.2) on 2026-10-03, under a
load average of 3–4. Times are medians of three runs of the real CLI; in-process times are single runs.

## Results

### Check
| Features | `hozu check` | `tsc --noEmit` | `hozu validate` | check after a one-line edit |
|---|---|---|---|---|
| 50 | 0.83 s | 0.27 s | 0.53 s | 0.83 s |
| 200 | 2.10 s | 0.87 s | 1.13 s | 2.09 s |
| 500 | 4.62 s | 2.20 s | 2.26 s | 4.61 s |

- **Linear,** about 9 ms per feature.
- **No incremental gain:** a one-line edit costs exactly a full check.
- **`check` ≈ types + validate:** the two run one after the other.

**`hozu validate` split, in process, at 500 features:**

| Stage | Time |
|---|---|
| Loading the source (the transform plus importing 1,500 files) | 1.11 s |
| `buildProject` | 0.25 s |
| Rules | 0.11 s |
| Rules + contracts | 0.23 s |

At 50 features the same stages take 0.29, 0.04, 0.02 and 0.03 s. **Loading dominates; rules and contracts are
cheap.**

**`tsc --incremental` (TypeScript 7.0.2) at 500 features:**

| Change since the last run | Time |
|---|---|
| None | 0.16 s |
| A function body inside a model | 2.04 s |
| A string literal in a view | 2.01 s |
| Full run, for comparison | 2.31 s |

TypeScript 7.0.2 re-checks almost the whole program after any edit, so incremental mode only saves a run with no
change.

### Client output, the same page (`/f0`) at each size
| Features | HTML | Payload | Payload `routes` | Islands | `fns.js` raw (gzip) | `fn`s in `fns.js` | `fn`s the page uses |
|---|---|---|---|---|---|---|---|
| 50 | 23.5 KB | 11.9 KB | 0.8 KB | 6 | 16.1 KB (0.5) | 100 | 2 |
| 200 | 26.2 KB | 14.7 KB | 3.3 KB | 6 | 64.6 KB (1.4) | 400 | 2 |
| 500 | 31.9 KB | 20.4 KB | 9.3 KB | 6 | 161.8 KB (3.2) | 1,000 | 2 |

- **The page grows with the app,** though it does not change: the payload carries every route of the project
  (`routes`, 9.3 KB at 500). Everything else in it is constant: data 5.1 KB, nodes 3.8 KB, machines 1.9 KB.
- **`fns.js` ships every `fn` of the app** to every page with an island: 1,000 `fn`s for a page that uses 2. The
  gzip figure is low only because the generated `fn`s are identical; real apps compress less.
- **A 100-row list with a button per row is 6 islands,** not 100. Island runs (ADR 0023) already make the per-row
  cost a few bytes: `ids` and `islands` together are 138 bytes.

### Data cache
| Distinct public keys | Entries kept | Heap growth |
|---|---|---|
| 100,000 | 100,000 | 69.5 MB |
| 1,000,000 | 1,000,000 | 701.8 MB |

About 0.7 KB per entry, and nothing is ever evicted.

### Startup at 500 features
`buildProject` 0.19 s; creating the handler and the first render 0.16 s. Loading the source (1.1 s, above) is the
largest part of a cold `hozu serve`.

## What this changes in ADR 0050
- **A (caches): confirmed.** One million keys hold 0.7 GB. The default bound (10,000 entries) caps the data cache
  near 7 MB.
- **C (`fns`): confirmed,** and widened: the page payload's `routes` must also hold only what the page's islands
  can reach.
- **D (incremental check): changed.**
  - Rule and contract memoisation would save at most 0.23 s of 4.6 s, so it is dropped, together with its
    correctness risk.
  - TypeScript 7.0.2's incremental mode does not help after an edit.
  - The gains that remain:
    1. run the type check and the Hozu checks **in parallel** (4.6 → about 2.3 s at 500);
    2. a **transform cache** keyed by file content, which cuts most of the 1.1 s load and also speeds up a cold
       `hozu serve`;
    3. keep `tsc --incremental` for the no-change case (0.16 s).
- **E (islands): narrowed.** Rows are not separate islands any more. What remains is making the page payload
  independent of the app's size (the `routes` fix in C); the short-id work is dropped.
- **Thresholds:**
  - P12: `hozu check` after a one-line edit at 500 features ≤ 2.6 s (today 4.6 s);
  - P13: one million keys keep ≤ `maxEntries` entries and ≤ 64 MB of heap growth;
  - A8: the `/f0` payload at 500 features within 5 % of the payload at 50 (today +71 %).

## After phase 3 (2026-10-03)
Per-feature fn modules (ADR 0050 C) and page-scoped payload routes (E), with the same apps:

| Features | HTML | Payload | Payload `routes` | Fn modules on `/f0` | Their bytes | All fn modules |
|---|---|---|---|---|---|---|
| 50 | 22.6 KB | 11.1 KB | 0 | 1 | 237 B | 11.9 KB |
| 500 | 22.6 KB | 11.1 KB | 0 | 1 | 237 B | 120.3 KB |

- **A8:** the `/f0` payload at 500 features is 0.0 % larger than at 50 (it was +71 %). The page no longer depends
  on the size of the app.
- **A7:** the page loads 237 B of `fn`s, its own feature's module (it was the whole app's 161.8 KB).
- The site exports only the builtins module: its `fn`s run on the server.
- P7 is 8,047 B (+20 B, the client now loads a list of modules).
