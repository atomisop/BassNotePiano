# GL-01-02 review: explicit glass role on the shared Button

Reviewer: Claude (self review; owner has not seen it). Local only, not pushed.

Change: `Button` sets `data-glass-role="button"` for the variants that are glass at rest (`default`, `primary`, `secondary`, `outline`, `destructive`, `danger`, `glass`),
and `GlassButtons` selects `[data-glass-role="button"]` first. The class-name selectors (`.liquid`, `shadow-raised-low`, ...) stay as a fallback for the ~100 files that
build their own raised controls; they are migrated screen by screen in later phases. No visual change is intended or expected.

Evidence: `tests/glassButtonRoles.test.ts` fails if a Button variant becomes glass (or stops being glass) without the list changing. `states/role-check.json` counts role
buttons and lenses on four pages (dashboard 2 of 2 lensed; on `/lessons` and `/account` the single visible role button, "Ask AI", read as not lensed at the 6 s mark on an
overloaded machine because lenses are built when the browser is idle; a follow-up query on `/account` showed it lensed). After shots of `/dashboard` and `/lessons` at three sizes
show the same screens as before; axe is clean on both at 1440x900; no overflow.

Limits: dark mode, Chromium only; light, Solid and the other browsers were verified for the Solid switch (GL-01-01) and the attribute does not change them. The count check is
timing sensitive and is not a gate; the unit test is.
