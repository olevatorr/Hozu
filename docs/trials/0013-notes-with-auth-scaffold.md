# Trial 0013 — The notes app again, with `--with auth` (ADR 0030)

**Question:** trial 0012 built the notes app at 2.79× Nuxt, because the scaffold had no accounts. With
`hozu add feature --with auth`, what does the Hozu build cost now, and does it stay correct?

## Setup
- **As in trial 0012:** the same spec, prompts, acceptance, model, and `claude -p` in the app directory.
- **Hozu:** two runs, with the packed 0.3.0 that includes ADR 0030.
- **Nuxt was not re-run:** its setup did not change, so the comparison uses trial 0012's two runs (mean 74.8 k).

## Results
| | Hozu run 1 | Hozu run 2 | Hozu mean | Trial 0012 Hozu mean | Nuxt mean |
|---|---|---|---|---|---|
| Acceptance | 15 / 15 | 15 / 15 | | 15 / 15 | 15 / 15 |
| Turns | 17 | 20 | | 20 | 6 |
| Output tokens | 6,622 | 5,671 | | 14,793 | 8,260 |
| Weighted | 127.2 k | 120.8 k | **124.0 k** | 209.1 k | 74.8 k |
| Cost (USD) | 0.56 | 0.51 | 0.54 | 0.89 | 0.36 |
| **vs Nuxt** | | | **1.66×** | 2.79× | |

## Reading the result
- **Both runs used `hozu add feature notes --page / --with auth,remove`,** then edited texts and details. Output
  tokens fell from 14.8 k to 6.1 k, because the agents no longer wrote the sign-in, session and per-user code.
- **Every check still passed:** isolation, double submit, no-JS forms, `HttpOnly`, the sign-in redirect.
- **The ratio (1.66×) now matches the task board's build (1.64× in trial 0010).** What remains is the fixed reading
  cost of a framework the model does not know.

## Conclusion
With `--with auth`, an account-based app costs 1.66× Nuxt to build instead of 2.79×, with every check passing. The
build-cost gap between simple apps and account-based apps is closed.
