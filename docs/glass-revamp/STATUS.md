# Glass revamp status

Done so far: GL-01-01 to GL-01-05 and GL-02-01 (owner chose the subtle direction: keep the look and the approved dock; make glass consistent, accessible and reliable). A task is DONE only when `npm run glass:verify` passes for it with real before and after evidence.

| Task | State | Evidence |
|---|---|---|
| GL-00-01 inventory and baseline | IN PROGRESS: 150 baseline shots (guest, student, admin; light and dark; 3 sizes; WebKit and Firefox on key pages), axe on 37 page runs, structural performance numbers. Skipped honestly: `/admin/settings` at 320px (did not load). Awaiting owner review of the baseline | INVENTORY.md, ROUTE-MATRIX.md, PERFORMANCE-BASELINE.md, evidence/GL-00-01/ |
| GL-00-02 migration plan | WRITTEN: component migration table in INVENTORY.md, DESIGN-SYSTEM.md. Awaiting owner approval | INVENTORY.md, DESIGN-SYSTEM.md |
| GL-00-03 accessibility and evidence gates | BUILT: `npm run glass:verify` (rejects DONE without real screenshots, tests, review, axe with no serious or critical), CI step added, skill `bnp-liquid-glass`. CI step not yet run on GitHub | scripts/glass-revamp/verify-evidence.mjs, .github/workflows/ci.yml |
| GL-01-01 Solid surfaces switch plus dashboard contrast, top-banner and sidebar-highlight fixes | DONE (commit 46bfb9f5; `npm run glass:verify` passes) | evidence/GL-01-01/ |
| GL-01-02 explicit glass role on the shared Button (`data-glass-role`), selector reads it, unit test keeps it in step | DONE (commit ae31e436) | evidence/GL-01-02/ |
| GL-01-03 floating surfaces in Solid, reduced transparency and forced colors, keyboard checks, admin data legend fix | DONE (commit 606ce43d) | evidence/GL-01-03/ |
| GL-01-04 accessibility sweep, 51 axe runs over student and admin routes | DONE: zero violations, no overflow | evidence/GL-01-04/ |
| GL-01-05 Tailwind backdrop-blur panels (top banner, scrims, marketing nav) honor Solid and reduced transparency | DONE | evidence/GL-01-05/ |
| GL-02-01 Solid surfaces on public pages, piano lesson, admin at phone width, WebKit and Firefox: 0 overflow, 0 axe findings | DONE | evidence/GL-02-01/ |
| Production-build performance (glass vs Solid) | MEASURED (not a code task, no DONE claim): Solid cuts blurred elements to 0-1 per page with no LCP change; `/account` at 390 has a pre-existing 0.113 layout shift | PERFORMANCE-BASELINE.md, evidence/GL-00-01/perf-production/ |
| Phone backdrop budget | CHECKED, no change needed: the 19 on phone home were 3 on screen (PERFORMANCE-BASELINE.md correction) | PERFORMANCE-BASELINE.md |
| Phase 1 remaining (move class-name glass consumers to roles, toasts, skeletons) | NEXT | |
| Phases 2 to 6 | NOT STARTED | |

## Baseline defects to fix (from GL-00-01)

- Axe, serious: `/dashboard` color-contrast (5 nodes) and target-size (1); `/admin/data` role-img-alt (4).
- The "Add your phone number" banner covers the top bar's title and controls at 1440px.
- On phones the dock's lensing distorts text of the card scrolling behind it.
- At 390px `/login` shows a dim second logo behind the card.
- FIXED in GL-01-01: dashboard axe findings, banner over the top bar, no Solid switch, sidebar highlight placed at the top left.
- The dim second logo on /login is not a bug in this branch: it is fixed upstream (main has the `.brand-for-ink` rules this branch lacks). Rebase before merging.
- Public pages (home, pricing, login, register, classes, terms) are locked to the dark theme by design, so they have no light look to restyle.

## Tooling and honesty notes

- Local app: `revamp-dev` (port 3101, local Postgres 5433, db `bnp_revamp`), test accounts from `scripts/seed-revamp-test.mjs`.
- Captures run one at a time: `scripts/glass-revamp/baseline.sh <TASK> <before|after>`; single pages with `shots.mjs`. Parallel lanes starve the dev server.
- The machine was heavily loaded (load average 50 to 150), so LCP is not usable; only structural counts are (see PERFORMANCE-BASELINE.md).
- The local database `bnp_revamp` needs `prisma migrate deploy` after pulling new migrations (the piano page failed until `PianoPracticeAttempt` existed). Local only.
- `Rework.md` was never provided; the spec text pasted in chat is the source.
