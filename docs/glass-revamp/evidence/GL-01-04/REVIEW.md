# GL-01-04 review: accessibility sweep

Reviewer: Claude (self review; owner has not seen it). Local only.

Sweep (axe WCAG 2.2 AA plus best practice, one capture at a time, local dev server): student routes (13) dark at 1440x900, admin routes (12) dark at 1440x900, student routes in Solid at 390x844 and 320x700, student routes light at 1440x900, plus a retry of `/about` that first failed to load. 51 axe runs, zero violations of any impact, zero horizontal overflow, zero unexpected redirects. Baseline had 3 serious findings (dashboard contrast and target size, admin data role-img-alt); all fixed in GL-01-01 and GL-01-03.

Honest limits: Chromium only; student light and Solid at 1440 only where listed above; routes needing fixtures (parent mode, receipts, a scale player, detail pages) are not covered (see ROUTE-MATRIX.md); `/admin/settings` at 320px did not load in the baseline and is not re-run here. Axe finds about a third of real accessibility problems; the keyboard checks in GL-01-03 cover one screen.
Only 8 pictures are committed (the "keep" folder); the rest stay local and their results are in the manifests and `axe-results.json`.
