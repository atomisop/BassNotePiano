# Full app UI and UX audit: the rule

The owner's standing instruction (2026-11-28): when a UI or UX audit, revamp, polish or "make it premium" job is asked for, every
installed design skill is used and the WHOLE app is covered. No skill is skipped quietly and no screen is skipped quietly. This file
is the checklist; `CLAUDE.md` points here.

## The rule

1. **Every skill below is run, or marked N/A with a one-line reason** in the audit ledger (`docs/UI-AUDIT-LEDGER.md`). "Didn't get to
   it" is not a reason. A skill that is not installed in the session is listed as "not installed", never pretended.
2. **Every screen in the coverage list is looked at RENDERED** (Playwright, seeded local database, real data in it), not judged from
   the code. Each screen at 390px and 1280px; the admin also at 768px; spot checks at 320px. Both themes (`ink` dark, `paper` light).
   Every state that can happen: loading, empty, filled, long content, error.
3. **Order of work**: read the rules first, then review everything, then fix. Never start fixing before the review pass of that area is
   in the ledger.
4. **The owner's decisions win over any skill.** `CLAUDE.md`, `DESIGN.md`, `PRODUCT.md` and dated owner decisions are not findings to
   undo. If a skill flags one (for example glass on the login card or the Instagram-style dock, the single remaining "i" hint, Nunito,
   the burnt orange accent), record it as "conflicts with owner decision, not changed" and move on. Ask before changing any of them.
5. **Fixes follow the house rules**: `DESIGN.md` tokens and hierarchy (one focal point per card, one primary button, the rest in a
   More/Manage menu, orange as the only accent and never a state), `CardKit`, icons only from `appIcons`, no new `<Hint>`, no em
   dashes, nine admin pages and no tenth, `tap` on small targets, `useDialogFocus` in modals.
6. **Every fix is re-checked rendered** (screenshot before and after) and the normal gates pass: `tsc --noEmit`, `next lint`,
   `npm test`, `npm run build`, and axe-core on the changed screens.
7. **Work ships in small PRs by area** (one admin section, one student area), each with its ledger rows ticked.

## Skills, in the order they are used

### 1. Ground rules (read before looking at any screen)
| Skill | Used for |
|---|---|
| `uxkin:no-ui-slop` | Work from the existing design system, design every state |
| `ui-ux-behaves:ui-ux` | Entry point: which behaves apply to each screen |
| `design-skills:design-systems`, `design:design-system` | Audit `DESIGN.md`, tokens and components for drift and hard-coded values |
| `intuitive-software-design:product-mental-model` | The objects (student, plan, bill, class, credit) and their names as the user sees them |

### 2. Whole-screen reviews (every screen in the coverage list)
| Skill | Used for |
|---|---|
| `ui-design-review:review` (`ui-review`) | Senior designer pass, most important first |
| `ui-ux-behaves:review` | Behaves and the classic principles |
| `design:design-critique`, `design-skills:design-critique` | Heuristics, UX laws, information architecture |
| `intuitive-software-design:intuitive-software-design` | UI / Flow / Feel score and smallest changes |
| `vectorlab-ux-skills:ux-audit` | Runs every VectorLab rule below at once |
| `ux-ui-audit:ux-ui-audit` | Measured: contrast, tap targets, focus rings, Hick and Fitts, design-system conformance |
| `website-design:review-page` (`web-review`) | Marketing pages only |
| `dashboard-design:review` (`dashboard-review`) | Every admin page and the student Home |

### 3. Focused rule passes (VectorLab and Behaves, per screen where the thing exists)
`vectorlab-ux-skills:` `anti-slop`, `colour-palette`, `typography`, `spacing`, `viewports`, `page-patterns`, `surfaces`, `icon-buttons`,
`forms`, `labels`, `defaults`, `verbs`, `errors`, `empty-states`, `loaders`, `keyboard`, `motion`, `transitions`, `reduced-motion`.
`ui-ux-behaves:` `ui-ux-active` (buttons, destructive actions, undo), `ui-ux-form`, `ui-ux-table`, `ui-ux-tabs`, `ui-ux-dialog`,
`ui-ux-passive` (toasts, status, offline), `ui-ux-date` (calendars, bill dates), `ui-ux-chart` (money and data pages).
`dashboard-design:data-display` and `dashboard-design:chart` for every number, table and chart on admin pages.
`design-skills:interaction-design` for microinteractions and state machines (booking, payment sheet, pull to refresh).
`intuitive-software-design:decision-support-design` for plan choice, pricing and every approve or reject screen.

### 4. Accessibility
`design:accessibility-review` and `design-skills:accessibility-audit` (WCAG 2.2 AA) plus axe-core, as `CLAUDE.md` already asks.

### 5. Journeys (walked end to end, as a newcomer)
`ui-ux-behaves:walkthrough` and `intuitive-software-design:user-task-walkthrough` for each journey below;
`intuitive-software-design:multi-role-workflow` for the ones that cross people (parent and child, payer and group, student and admin
approving a payment); `intuitive-software-design:connected-experience-design` for email, push, Discord and the calendar feed landing
back in the app.

Journeys: sign up to first lesson (email and Google); start a solo plan and pay by Zelle; start a group plan with invites; parent mode
link, pay, book for a child; book, move and cancel a class; daily practice and scale unlock; Atom chat to human handoff; owner morning:
Overview, Needs you, approve a payment, mark attendance; owner sets up a plan with a scholarship; owner handles an unmatched bank email.

### 6. Copy
`ui-ux-behaves:copy-check` (stuttering words), `design:ux-copy` and `design-skills:ux-writing` for app copy;
`copywriting-kit:copy-diagnose` then `copywriting-kit:copy-edit` for marketing pages (never changing a price, date or claim).

### 7. Fixing
`ui-design-review:polish` (`ui-polish`) for the picked findings, in the app's own style; `design-skills:design-elevation` for the visual
pass; `intuitive-software-design:purpose-first-redesign` for any screen that needs rethinking rather than polishing (propose first, build
only after the owner agrees); `dashboard-design:build` / `dashboard-layout` when an admin page is rebuilt; `frontend-design` and
`superdesign` only for genuinely new screens.

### 8. Compare and keep it from coming back
`ui-design-review:compare` for the plan screen, sign-up, Settings and the admin Overview against how real products do it.
`ui-ux-behaves:audit` at the end to count source patterns that break the behaves and set a ratchet so the count can only go down.

### Expected N/A (write the reason in the ledger anyway)
`design:design-handoff` (no separate engineering team), `design:user-research`, `design:research-synthesis`, `design-skills:ux-research`
(need real user data; only run if the owner provides interviews or tickets), `intuitive-software-design:behavioral-evaluation` (tests the
plugin itself), `design-skills:journey-mapping`, `design-skills:ux-strategy`, `design-skills:design-ops` (only if asked),
`website-design:landing-page` and `website-design:design-system` (only for a new marketing page or a new design direction),
`copywriting-kit:brand-voice` and `copy-proof-check` (only with the owner's samples or evidence).

## Coverage list (every route)

**Public**: `/`, `/classes`, `/pricing`, `/shop`, `/terms`, `/privacy`, offline page.
**Auth**: `/login`, `/register`, `/verify-email`, `/verify-phone`, `/forgot-password`, `/reset-password`, `/account-locked`,
`/wrong-account`, `/unsubscribe`.
**Student**: `/dashboard`, `/roadmap`, `/scales/[slug]` (trial, full, locked), `/practice`, `/streak`, `/leaderboard`, `/lessons`,
`/billing/plans` (new plan solo, group, parent; running plan), `/billing/history`, `/billing/receipt/[id]`, `/friends`, `/messages`,
`/mail`, `/account` (every group), `/profile`, `/about`, `/support`, `/parent`, `/parent/[childId]`, onboarding.
**Shell**: top bar (phone and desktop), sidebar and spotlight, dock, bill bar, banners, bell, profile menu, command menu, Atom widget,
Add to Home prompt, toasts, offline pill.
**Admin**: all nine pages and every pill, tab and `_view` under them, as listed in `src/lib/adminNav.ts`: Overview (Needs you, Follow up);
Payments (Unmatched, Class credits, Check); Plans (Prices, Scholarships); People (Class form, Added, Staff, student page with all six
sections, side summary); Schedule (Today, Times, Requests, Attendance, Reserved); Lessons (Roadmaps, Discord); Inbox (Chats, Messages,
Sent); Settings; System (Activity, Data, Security). Plus every dialog the student page opens (Set up plan, Plan settings, Book a class,
Weekly time, Group, Parent links, Mark paid, Fix payment).

## The ledger

`docs/UI-AUDIT-LEDGER.md` holds one table per area: screen, width and theme checked, skill, finding, severity, decision (fix / owner
decision / N/A / later), PR. An audit is done only when every skill above has a row (run or N/A) and every screen above has been
checked at the widths in rule 2.
