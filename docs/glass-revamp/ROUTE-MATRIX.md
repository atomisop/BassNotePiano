# Route matrix (built from `src/app/**/page.tsx`, 62 pages)

Who can see each route, which shell wraps it, how glass is used on it today, and which phase restyles it.
"Baseline" means a real screenshot set exists under `evidence/GL-00-01/before/` (1440x900, 390x844, 320x700).
Glass is only for floating chrome (top bar, dock, sheets, menus, popovers, toasts); content cards stay solid.

| Route | Who | Shell | Glass today | Phase | Baseline |
|---|---|---|---|---|---|
| `/` | public | marketing | hero buttons (`.liquid`), nav | 2 | yes (dark, light) |
| `/classes` | public | marketing | cards, buttons | 2 | yes |
| `/pricing` | public | marketing | plan cards, Start plan buttons | 2 | yes |
| `/shop` | public | marketing | cards | 2 | yes |
| `/terms`, `/privacy` | public | marketing | nav only | 2 | yes |
| `/login`, `/register` | public | auth | form card, buttons | 2 | yes |
| `/forgot-password`, `/reset-password`, `/verify-email`, `/verify-phone` | public / signed in | auth | form card | 2 | not yet (need tokens) |
| `/account-locked`, `/wrong-account`, `/unsubscribe` | public | auth | card | 2 | not yet |
| `/onboarding` | signed in | bare | card | 3 | not yet |
| `/dashboard` (Home) | student | dashboard | hero, rows, dock, top bar | 3 | yes |
| `/roadmap` | student | dashboard | scale cards | 3 | yes |
| `/scales/[scaleSlug]` | student | dashboard | course player | 3, 4 | not yet (needs a seeded scale) |
| `/practice`, `/practice/piano` | student | dashboard | keyboard lesson | 4 | `/practice` yes, piano partly in Rework evidence |
| `/lessons` | student | dashboard | slot picker, booking sheets | 5 | yes |
| `/friends`, `/streak`, `/leaderboard` | student | dashboard | cards | 3 | yes |
| `/mail`, `/mail/[mailId]` | student | dashboard | list, detail | 3 | list yes |
| `/account`, `/profile`, `/about` | student | dashboard | settings tabs, switches | 3 | yes |
| `/billing/plans`, `/billing/history`, `/billing/receipt/[paymentId]` | student | dashboard | plan form, pay sheet | 5 | plans, history yes |
| `/parent`, `/parent/[childId]` | parent | dashboard | cards | 5 | not yet (needs link) |
| `/admin` and 13 section pages | admin | dashboard + admin tabs | tabs, menus | 5 | 12 pages |
| `/admin/users/[userId]`, `/admin/contacts/[contactId]`, `/admin/support/[id]` | admin | dashboard | detail pages | 5 | not yet |
| `/motion-preview`, `/stageshow-preview` | internal | bare | previews | none | out of scope |

## Redirect and gate behaviour to keep

- Signed-out visits to any `(dashboard)` route go to `/login` (middleware).
- A student visiting `/admin/*` is refused; the baseline run records where each lands (`finalUrl` in the manifests).
- A banned or payment-locked account is routed to `/account-locked`.
- Tagged email links outside the owner's account land on `/wrong-account`.

## Coverage rule

A phase task is only DONE when every route it owns has before and after shots at 1440x900, 390x844 and 320x700 in light, dark and solid
mode, an axe result with no serious or critical issues, and no horizontal overflow. Routes marked "not yet" above need a seeded fixture
first; that seeding is part of the owning phase, not skipped.
