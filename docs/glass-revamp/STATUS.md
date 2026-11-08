# Glass revamp status

Done so far: GL-01-01 and GL-01-02. A task is DONE only when `npm run glass:verify` passes for it with real before and after evidence.

| Task | State | Evidence |
|---|---|---|
| GL-00-01 inventory and baseline | IN PROGRESS: 150 baseline shots (guest, student, admin; light and dark; 3 sizes; WebKit and Firefox on key pages), axe on 37 page runs, structural performance numbers. Skipped honestly: `/admin/settings` at 320px (did not load). Awaiting owner review of the baseline | INVENTORY.md, ROUTE-MATRIX.md, PERFORMANCE-BASELINE.md, evidence/GL-00-01/ |
| GL-00-02 migration plan | WRITTEN: component migration table in INVENTORY.md, DESIGN-SYSTEM.md. Awaiting owner approval | INVENTORY.md, DESIGN-SYSTEM.md |
| GL-00-03 accessibility and evidence gates | BUILT: `npm run glass:verify` (rejects DONE without real screenshots, tests, review, axe with no serious or critical), CI step added, skill `bnp-liquid-glass`. CI step not yet run on GitHub | scripts/glass-revamp/verify-evidence.mjs, .github/workflows/ci.yml |
| GL-01-01 Solid surfaces switch plus dashboard contrast, top-banner and sidebar-highlight fixes | DONE (commit 46bfb9f5; `npm run glass:verify` passes) | evidence/GL-01-01/ |
| GL-01-02 explicit glass role on the shared Button (`data-glass-role`), selector reads it, unit test keeps it in step | DONE (commit ae31e436) | evidence/GL-01-02/ |
| Phase 1 remaining (class-name consumers to roles, top bar, dock, popovers, toasts, skeletons) | NEXT: needs the owner's call on how far the look changes (see below) | |
| Phases 2 to 6 | NOT STARTED | |

## Baseline defects to fix (from GL-00-01)

- Axe, serious: `/dashboard` color-contrast (5 nodes) and target-size (1); `/admin/data` role-img-alt (4).
- The "Add your phone number" banner covers the top bar's title and controls at 1440px.
- On phones the dock's lensing distorts text of the card scrolling behind it.
- At 390px `/login` shows a dim second logo behind the card.
- FIXED in GL-01-01: dashboard axe findings, banner over the top bar, no Solid switch, sidebar highlight placed at the top left.
- Public pages (home, pricing, login, register, classes, terms) are locked to the dark theme by design, so they have no light look to restyle.

## Tooling and honesty notes

- Local app: `revamp-dev` (port 3101, local Postgres 5433, db `bnp_revamp`), test accounts from `scripts/seed-revamp-test.mjs`.
- Captures run one at a time: `scripts/glass-revamp/baseline.sh <TASK> <before|after>`; single pages with `shots.mjs`. Parallel lanes starve the dev server.
- The machine was heavily loaded (load average 50 to 150), so LCP is not usable; only structural counts are (see PERFORMANCE-BASELINE.md).
- `Rework.md` was never provided; the spec text pasted in chat is the source.
