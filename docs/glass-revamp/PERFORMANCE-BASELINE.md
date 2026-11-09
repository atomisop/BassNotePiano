# Performance baseline (before any glass change)

Measured with `scripts/glass-revamp/perf.mjs` on 2026-11-08, Chromium, dark mode, against the LOCAL DEV server
(`next dev`, port 3101) on a shared machine whose load average was 50 to 150 during the run.

## What is and is not trustworthy

- **Trustworthy (do not depend on machine load):** backdrop-filter element count, SVG filter count, DOM node count, layout shift (CLS).
  These are the glass cost drivers and the numbers every later task must not make worse.
- **Not trustworthy:** LCP. It read 10 to 85 seconds because the machine was starved and the dev server compiles on demand.
  They are recorded in `evidence/GL-00-01/metrics-before-*.json` for completeness and must NOT be used as a budget or a before/after claim.
  Real LCP and INP need a production build (`next build && next start`) on an idle machine; that is a Phase 6 task (GL-06-xx).

## Structural baseline (Chromium, dark)

| Page | Size | Backdrop-filter elements | SVG filters | DOM nodes | CLS |
|---|---|---|---|---|---|
| `/` | 1440x900 | 6 | 10 | 993 | 0 |
| `/` | 390x844 | 19 | 1 | 903 | 0 |
| `/pricing` | 1440x900 | 7 | 3 | 2028 | 0 |
| `/pricing` | 390x844 | 8 | 1 | 2008 | 0 |
| `/login` | 1440x900 | 0 | 1 | 482 | 0.0104 |
| `/login` | 390x844 | 0 | 1 | 482 | 0.0483 |
| `/dashboard` (student) | 1440x900 | 10 | 5 | 1514 | 0.0166 |

Rows for `/dashboard` at 390 and for `/lessons` and `/account` were not captured: the pages did not finish loading on the overloaded machine, and
no placeholder was written. They are re-captured in Phase 1.

## Correction: what is actually on screen (2026-11-08, `scripts/glass-revamp/backdrop-list.mjs`)

The counts above include elements that cost nothing: hidden desktop-only links (0 by 0 pixels) and controls far below the fold, which the browser does not
composite. Counting only elements inside the viewport:

| Page | Size | Backdrop-filter total | On screen |
|---|---|---|---|
| `/` | 390x844 | 19 | 3 |
| `/` | 1440x900 | 2 | 0 |
| `/pricing` | 1440x900 | 4 | 0 |
| `/dashboard` | 390x844 | 12 | 4 |
| `/dashboard` | 1440x900 | 10 | 8 |

So the earlier reading of home on a phone (19) was not a real cost: 16 of the 19 are hidden or 3,500 pixels down the page. No change was made for it.
`/pricing` at 390 did not load in time and has no number. Use the on-screen column as the budget.

## Findings

- Home at 390px lists 19 backdrop-filter elements but only 3 are on screen (see the correction above).
- Login's layout shift at 390px (0.0483) is within the 0.1 "good" limit but the highest measured; the card and logo settle after first paint.
- Budgets to hold from here: on-screen backdrop elements and SVG filters per page no higher than the tables; CLS under 0.1.
