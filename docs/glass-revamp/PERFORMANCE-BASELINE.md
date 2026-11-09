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

## Production build, quiet machine (2026-11-08)

`next build` (passes, exit 0) served with `next start` on port 3103 against the local test database; machine load average about 7 (the dev-server numbers above were taken at 50 to 300).
One run per cell with `scripts/glass-revamp/perf.mjs`, Chromium, dark. Single runs are noisy: treat LCP differences under about 300 ms as nothing.
Raw files: `evidence/GL-00-01/perf-production/`.

| Page | Size | LCP glass / Solid (ms) | CLS glass / Solid | Backdrop elements glass / Solid | SVG filters glass / Solid |
|---|---|---|---|---|---|
| `/` | 1440 | 2572 / 1464 | 0 / 0 | 2 / 0 | 11 / 11 |
| `/` | 390 | 1844 / 1904 | 0 / 0 | 5 / 0 | 9 / 0 |
| `/pricing` | 1440 | 964 / 956 | 0 / 0 | 4 / 0 | 5 / 0 |
| `/pricing` | 390 | 904 / 924 | 0 / 0 | 4 / 0 | 4 / 0 |
| `/login` | 1440 | 800 / 752 | 0 / 0 | 0 / 0 | 1 / 0 |
| `/login` | 390 | 152 / 164 | 0 / 0 | 0 / 0 | 1 / 0 |
| `/dashboard` | 1440 | 1076 / 1224 | 0.0001 / 0.0087 | 10 / 1 | 5 / 1 |
| `/dashboard` | 390 | 1096 / 1112 | 0.0811 / 0.0811 | 12 / 1 | 2 / 1 |
| `/lessons` | 1440 | 232 / 224 | 0.0001 / 0.0001 | 9 / 1 | 5 / 1 |
| `/lessons` | 390 | 212 / 808 | 0.0293 / 0.0365 | 11 / 1 | 2 / 1 |
| `/account` | 1440 | 256 / 236 | 0.0001 / 0.0001 | 9 / 1 | 15 / 1 |
| `/account` | 390 | 220 / 220 | 0.1131 / 0.1133 | 21 / 1 | 1 / 1 |

What it shows: Solid removes almost every backdrop blur and SVG lens (signed-in pages go from 9 to 21 blurred elements down to 1) without a measurable LCP change, so the setting is a
real option for weak devices. Glass itself is not slow on this machine.

Findings: `/account` at 390 shifts 0.113 (over the 0.1 "good" limit), in glass and Solid alike, so it is not glass. Sources: the page column moves down about 65 px while the
Settings content mounts (and a 40 px move before that). Left as a finding for the owner; the fix belongs in the Settings layout, not the glass work. Marketing `/` at 1440 shows a
single slower LCP (2.5 s) in glass that did not repeat in Solid; one sample, not a conclusion.
Not measured: INP, Lighthouse scores, a low-end phone, Safari or Firefox timing.
