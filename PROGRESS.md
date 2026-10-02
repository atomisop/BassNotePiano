# BassNotePiano Redesign Progress

> **Rule:** After finishing each step, update this file and make a git commit with a clear message.

## Checklist

- [x] STEP 1 Audit (see docs/redesign/step-1-audit.md)
- [x] STEP 1B Narrow-column fix
- [x] STEP 2 Design system (preview at /admin/design-system)
- [x] STEP 2B Layout and wireframes
- [x] STEP 2C Depth, signal color, and type contrast
- [x] STEP 3 Component sources (docs/redesign/component-sources.md)
- [x] STEP 4 Redesign screens
- [x] STEP 5 Piano keyboard visuals
- [ ] STEP 6 Quality pass

## Decisions I approved

- 2026-10-02 Fonts: keep Baloo 2 only for each screen's one Hero element; one clean font for everything else.
- 2026-10-02 The "Continue" button (and every primary action) becomes green.
- 2026-10-02 Success messages stop using green: white text plus a check icon instead.
- 2026-10-02 Public pages (homepage, pricing, classes, shop, terms, privacy) are out of scope. Leave them alone.
- 2026-10-02 STEP 1B page layouts approved. Profile stays its own page (opened from the avatar, top right) with the Wide layout.
- 2026-10-02 STEP 2B wireframes approved. Navigation: the floating dock is the only navigation at every size (no bottom tab bar, no top-bar menu row).
- 2026-10-02 Build Notes and Metronome now. Notes are saved to the student's account (new database table approved).
- 2026-10-02 Lesson page: outline and lesson side by side on one screen (same lessons and completion rules). Home tabs In progress / Completed / Badges filter existing data.
- 2026-10-02 User authorized completing ALL remaining steps without stopping for approval between steps (user AFK). Commit per step on ui-redesign. The user also authorized merging to main when everything is done (PR, green CI, security review first).

## Notes for next session

- STEP 1B done 2026-10-02. Four shared layouts live in src/components/layout/PageLayouts.tsx (Wide 1440px, TwoPane, Settings 1152px, Narrow 440px); widths are --container-* tokens in globals.css. Every signed-in page uses one of them.
- Wide pages are only wider so far. Their new columns (Home right panel, lesson page three zones) come in STEP 2B.
- Verifying signed-in pages: a throwaway local database `bnp_redesign_verify` plus a test admin (login in the gitignored `.env.redesign-verify.local`), served by the `next-dev-verify` launch config on port 3100 with email sending off. docs/redesign/width-check.cjs checks every page at all five widths. Never point verification at the real dev database (it is behind on migrations and sends real email).
- Leftover Sep 24 edits are in git stash `bnp-sep24-leftovers-pre-ui-redesign` (the useful ones shipped in #65).
- STEP 2 done 2026-10-02. Tokens are in globals.css @theme (text-hero/body/small, rounded-control/card/sheet, shadow-plane-mid/front/signal, signal color, --space-*, --z-*, --dur-*). New components in src/components/ui: Card + Eyebrow, Hero + BackPlane, Tabs, Badge, Avatar, Dialog (bottom sheet on phones). Button, Input, Toaster, Skeleton, EmptyState restyled. cn() in src/lib/utils.ts knows the token names.
- Green buttons and neutral "success" apply everywhere via <body>; the public site opts out through its existing data-surface="marketing". The cookie banner's Accept button uses the neutral `paper` variant on purpose (consent must not be nudged).
- Not done yet, by design: individual pages still use their old sizes and decorative greens (that sweep is STEP 2C / STEP 4), and the navigation shell choice (top bar vs sidebar) is STEP 2B.
- STEP 2B done 2026-10-02: Home (main column + right panel + tabs) and the lesson page (ScaleWorkspace: outline, lesson + instrument, tool rail with Key/Chart/Chords/Files/Notes/Metronome). Notes use the new ScaleNote table (migration 20261002000000_add_scale_notes, verified zero drift on a fresh database).
- STEP 2C done 2026-10-02: every signed-in page title is the Hero (Baloo 2); all other text is text-body (reading) or text-small; no text below 13px in scope. Decorative greens removed (unread counts, booking status, info boxes, Atom bubbles); selected/tappable states use the signal tint. Old emerald success classes render as paper via the <body> override (not renamed). Removed dead Sidebar/MobileTabBar/MoreSheet/TiltGlow/navigation-menu.
- STEP 3 done 2026-10-02: Tabs got an MIT sliding thumb adapted from Halaska UI (21st.dev). Every other component is built on deps already in the repo (Radix, shadcn, lucide). Admin bulk actions NOT built: they would be new behavior on payments/accounts, left for the owner to decide.
- STEP 4 done 2026-10-02: app-wide card material (glass-surface vars re-pointed to the middle plane inside [data-surface=app]); Book a class split into booking + side panel (credits, bookings, history); Payment plan split like Family bundle; admin Students/Payments/Payment Plans got client-side search (AdminListSearch); chat bubbles ink/paper. Home and the lesson page were done in 2B; titles/sizes/greens in 2C. Onboarding already has one Hero per step; the first-run tour targets all still exist.
- STEP 5 done 2026-10-02: PianoKeyboard redrawn as a real instrument (ivory/ebony via piano-* utilities in globals.css, same in every theme), scale notes marked ink/paper, green only on the sounding or pressed key, sound on pointer-down (Enter/Space for keyboard users). Fretboard sounding note is green too. No scale/chord/note logic changed.
