P1-ONB-01 (two steps), P1-ONB-03 (instrument carried from home page) and the engineering part of P1-A11Y-01 (onboarding form semantics).

Before: five steps; step 1 showed only a username. Selection buttons exposed no selected state, the username field had no label, errors were plain text.
After: step 1 = username + instrument (real radio inputs, Piano preselected from /register?instrument=piano), step 2 = level + optional goal. Genres removed from the flow (column kept; a new account saves none). Focus moves to each step heading; a bad username is announced (role=alert) and focus returns to the field with aria-invalid.

Found by the 320px test and fixed: the app shell locks document scroll, so the taller step 1 pushed Next off-screen with no way to scroll (unreachable on small phones). The onboarding layout now scrolls inside itself.

Verified: 6 scenarios on desktop, mobile and 320px (preselect and radio state, validation, full flow with saved instrument and level in the DB, home-page intent carried through, crafted links ignored, axe wcag2a/2aa/22aa with no serious or critical issues on both steps).

NOT done: no VoiceOver or NVDA pass, no light-theme screenshots, no returning-user redirect test. Axe passing is not proof of WCAG conformance. The level/goal labels reuse the existing enums; "Ethiopian music / church / fundamentals" goals from the plan need new enum values (schema change), not done.
