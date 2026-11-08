# GL-00-01 review: baseline capture

Reviewer: Claude (self review; owner has not yet seen these). Date 2026-11-08.

What was captured, from the real local app (dev server, port 3101, local Postgres, test accounts from `scripts/seed-revamp-test.mjs`):
150 screenshots, 1440x900 / 390x844 / 320x700, guest light and dark, student dark (13 routes) and light (4 routes), admin dark (12 routes),
WebKit and Firefox on key pages. Zero horizontal overflow, zero unexpected redirects (see the `manifest-before-*.json` files).

Not captured, and why: `/admin/settings` at 320x700 (page never loaded on an overloaded machine; skipped, not faked); routes needing fixtures
(see `ROUTE-MATRIX.md`); performance LCP is not trustworthy on this machine (see `PERFORMANCE-BASELINE.md`).

Accessibility result is a BASELINE and contains serious violations (dashboard contrast and target size, admin data role-img-alt). They are the
work of Phase 1 and later; this is why `glass:verify` cannot pass this task as DONE.
