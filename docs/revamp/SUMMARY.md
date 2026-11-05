# Revamp summary (2026-11-05)

Local commits only; nothing pushed. Branch `admin-nav-simplify`.

## What the audit found
The app was already on tokens. A script that measures every button, link, input and switch (height under 36px without `tap`, inputs under 16px, off-scale corners, horizontal overflow) found no real problems on the 14 student and billing screens at 390px and the 21 admin screens at 1024px. The only hits were Radix switches whose 44px touch area comes from a pseudo-element (false positives). The real gaps were in the top bar and in motion.

## Changed
- **Top bar (screen 1):** every control 36px and a pill (the sidebar toggle was 32, the streak badge 30, credits 28, and four buttons had 12px corners among pills). `controls/top-bar.md` has the table, `shots/` the before and after.
- **Shared press (rule 4):** `press` and `press-soft` dip to 0.97 on ease-ios; the old spring (0.94 plus a grow on hover) is gone (rule 13). Raw buttons and sidebar rows follow the same rule.
- **Switch (rule 5):** the knob stretches 12% while held, for the Radix switch and the hand-built ones.
- **Popovers (rules 2, 10, 11, 12, 15):** tooltips use `pop` (0.95, from the trigger, exit 20% faster); the profile menu's variant is 0.95 from the top right; `ActionMenu` (the admin Plan menu and others) now opens from its corner and leaves faster, and stays mounted.
- **Lists (rule 3):** rows settle in 30 ms apart on mail, billing history, friends, leaderboard, notifications, staff, accounts, plans and support threads (`stagger-item` and `data-stagger` in `globals.css`).
- **Icon swaps (rule 18):** show/hide password, visible/hidden (roadmaps, student notes) and the light/dark switch crossfade with scale and blur.
- **No bounce (rule 13):** offline pill and iOS banner overshoot removed.
- **Shared pieces built:** `StaggerList`, `IconSwap`, `SuccessPulse`, `MaskReveal`, `SharedLayout`, `useRubberBand`, `useArc`, preview at `/motion-preview` (dev only).

## Not done, and why
- **Not audited at all** (rows marked in `CHECKLIST.md`): the 6 public pages, the 10 sign-in and onboarding pages, the scale player, mail message, parent child view, receipt, and the admin student page, contact page and support thread. The browser pane went hidden and the dev server slowed to minutes per page (the machine ran at a load average near 100 and Next used about 8.7 GB), so I stopped.
- **Admin screens at 390px and light theme** were not audited.
- **Wired in the second pass (2026-11-05):**
  - Rule 20: the admin section tab underline is one `SharedLayout` element that travels to the chosen tab (`AdminNav.tsx`); the "More" menu opens with `pop`.
  - Rules 1 and 16: `tab-in` (fade and 6px rise) on the Lessons hub panels, the booking tabs (book, upcoming, past) and the parent child view tabs. The leaving panel goes at once, so old and new do not truly overlap; a real overlap would need both mounted.
  - Rules 8 and 17: the "Booked / Canceled / Rescheduled" message on Lessons wipes in with `MaskReveal` and pulses once with `SuccessPulse`.
  - Rule 6: Home's rows settle in with the stagger.
- **Still without a screen change, with reasons:** 7 (arc: no screen where an object visibly moves between containers; `useArc` is ready), 14 (pull to refresh and sheet drags already drive refs with no tween while held), 19 (the snap carousel already has a wall spring at its ends and sheets rubber-band on release; `useRubberBand` is ready for a new drag), 9 (everything that moves on screen already uses ease-ios; `--ease-move` is defined but unused).
- **Not verified in a browser after the change:** the new `ActionMenu` animation, the stagger lists, the icon swaps and the switch stretch. Lint passes on every touched file, and type-checking showed no errors in my files before the ActionMenu change (not re-run after it).
- **No before and after shots** for screens other than the top bar.

## Needs your decision
- Ask AI's orange ring and glow versus "accent only for the main action".
- The stray " 2" and " 3" duplicate files (about 40) fail the type check and clutter the repo; I touched none.
