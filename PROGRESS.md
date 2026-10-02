# BassNotePiano Redesign Progress

> **Rule:** After finishing each step, update this file and make a git commit with a clear message.

## Checklist

- [x] STEP 1 Audit (see docs/redesign/step-1-audit.md)
- [x] STEP 1B Narrow-column fix
- [ ] STEP 2 Design system
- [ ] STEP 2B Layout and wireframes
- [ ] STEP 2C Depth, signal color, and type contrast
- [ ] STEP 3 Component sources
- [ ] STEP 4 Redesign screens
- [ ] STEP 5 Piano keyboard visuals
- [ ] STEP 6 Quality pass

## Decisions I approved

- 2026-10-02 Fonts: keep Baloo 2 only for each screen's one Hero element; one clean font for everything else.
- 2026-10-02 The "Continue" button (and every primary action) becomes green.
- 2026-10-02 Success messages stop using green: white text plus a check icon instead.
- 2026-10-02 Public pages (homepage, pricing, classes, shop, terms, privacy) are out of scope. Leave them alone.
- 2026-10-02 STEP 1B page layouts approved. Profile stays its own page (opened from the avatar, top right) with the Wide layout.

## Notes for next session

- STEP 1B done 2026-10-02. Four shared layouts live in src/components/layout/PageLayouts.tsx (Wide 1440px, TwoPane, Settings 1152px, Narrow 440px); widths are --container-* tokens in globals.css. Every signed-in page uses one of them.
- Wide pages are only wider so far. Their new columns (Home right panel, lesson page three zones) come in STEP 2B.
- Verifying signed-in pages: a throwaway local database `bnp_redesign_verify` plus a test admin (login in the gitignored `.env.redesign-verify.local`), served by the `next-dev-verify` launch config on port 3100 with email sending off. docs/redesign/width-check.cjs checks every page at all five widths. Never point verification at the real dev database (it is behind on migrations and sends real email).
- Leftover Sep 24 edits are in git stash `bnp-sep24-leftovers-pre-ui-redesign` (the useful ones shipped in #65).
