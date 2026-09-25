# ADR 0001 — Verification gate: AI-friendliness and performance

- Status: accepted
- Phase: 0 (applies to every phase)

## Context
Tenon's claim is that invalid AI-generated programs are hard to express and valid ones are cheap to verify.
Claims like "AI-friendly" and "fast" decay into opinions unless they are measured. We need a gate that every
phase must pass, running in CI without network access or LLM API keys.

## Options
1. **Qualitative review only** — cheap, but unfalsifiable.
2. **LLM-in-the-loop eval** — measures the real thing, but is non-deterministic, costs money, needs secrets and
   cannot gate CI reliably.
3. **Automated proxies + performance budgets** — deterministic, runs in CI, measures properties that are
   necessary (not sufficient) for AI-friendliness.

## Decision
Option 3. An LLM eval may be added later as a non-gating report.

### AI-friendliness proxies
| Id | Metric | Budget |
|---|---|---|
| A1 | IR is byte-identical under any authoring order (fast-check, 1000 runs) and across repeated builds | 100% |
| A2 | Mistake catalog (≥ 20 typical LLM mistakes) is detected with the expected code, an IR pointer, a source location and a fix whose JSON Patch removes the diagnostic | 100% |
| A3 | `@tenon/core` public value exports | ≤ 15, snapshot-locked, no aliases |
| A4 | Common mistakes are TypeScript errors (`@ts-expect-error` fixtures); type instantiations for `examples/cart` | ≤ 50 000 |
| A5 | Every `--json` CLI output validates against its published JSON Schema | 100% |
| A6 | `examples/cart` source bytes | reported (soft) |

### Performance budgets
| Id | Metric | Budget |
|---|---|---|
| P1 | `validate(cart)` warm | < 2 ms |
| P2 | Synthetic 1000 features × 30 states × 10 events: build (no source capture) + validate, median of 7 | < 500 ms; 2× input ≤ 2.2× time (best of 7) |
| P3 | `tenon validate --json` cold start on cart, median of 10 | < 300 ms |
| P4 | Runtime dependencies of `@tenon/core`, `@tenon/validator`, `@tenon/cli` | 0 (workspace packages excluded) |

Budgets recorded now, enforced when the phase lands:
Phase 1 transition ≥ 1M/s · Phase 3/4 `runtime-client` ≤ 5 KB min+gz, 0 bytes JS for machine-less pages,
0 client fetches after hydration.

## Measured at the end of Phase 0
Node 22.22, Linux container, `pnpm bench`:

| Id | Result |
|---|---|
| P1 | 0.11 ms |
| P2 | ~340–385 ms; scaling 1.93–2.13× |
| P3 | ~205–230 ms |
| A4 | 31 525 instantiations (TypeScript 7) |
| A6 | 12 384 bytes |

Source capture (a V8 stack walk per builder call, ~4 µs) was the dominant build cost. Builds therefore skip it by
default in tooling, and the CLI rebuilds with capture only when there are diagnostics to locate (ADR 0003).

## Consequences
- `pnpm gate` = lint + typecheck + test + bench, and must be green at the end of every phase.
- Raising a budget requires a new ADR.
- A new diagnostic code is incomplete until it has a mistake-catalog entry.
