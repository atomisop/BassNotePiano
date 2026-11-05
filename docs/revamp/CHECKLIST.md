# Revamp checklist

One row per screen, in the order the loop runs them. 71 rows. Status: Todo, Doing, Done, Skipped (with reason). Control-level notes go in `docs/revamp/controls/<screen>.md` (one table per screen: control, measured, fix, UX laws, motion rules or n/a with reason).

## A. Shared shell and overlays (done first, every page inherits them)

| # | Screen | Route | Status | Before shot | After shot | Notes |
|---|---|---|---|---|---|---|
| 1 | Top bar (phone strip + desktop) | `TopBar.tsx` | Done (dark; light theme not shot) | shots/top-bar-before-* | shots/top-bar-after-* | controls/top-bar.md |
| 2 | Profile menu | `ProfileMenu.tsx` | Done (shared) | | | Menu opens at 0.95 from the top right via `popoverVariants`; rows already use `press-soft`. Not re-checked in the browser. |
| 3 | Dock | `AppDock.tsx` | Left alone | | | Instagram-style dock, kept as is per CLAUDE.md. Springs stay (dock only, rule 13). |
| 4 | Sidebar + spotlight | `AppSidebar.tsx` | Done (shared) | | | Sidebar row press used a spring; now ease-ios 0.97. |
| 5 | Command menu + shortcut sheet | `CommandMenu.tsx` | Audited, no change | | | Already honors keyboard-never-animates. Not edited. |
| 6 | Dialogs and bottom sheets | `ui/Dialog.tsx` | Audited, no change | | | Sheet and dialog already use ease-ios with a shorter exit. |
| 7 | Slide-over panels | `SlideOverPanel.tsx` | Audited, no change | | | Slide-over already fades and slides on ease-ios. |
| 8 | Toasts | `ui/Toaster.tsx` | Audited, no change | | | Sileo toasts; success already shown as a toast. |
| 9 | Atom assistant widget | `AssistantWidget.tsx` | Audited, no change | | | Atom uses critically damped springs (no bounce). |
| 10 | Top banners (phone, Discord, practice) | `TopBanners.tsx` | Done (shared) | | | iOS banner overshoot curve replaced with ease-ios. |
| 11 | Bill bar | `BillBar.tsx` | n/a | | | No interactive control to restyle; no motion applies. |
| 12 | Notification bell + admin alerts | `NotificationBell / AdminAlertsButton` | Done (shared) | | | Bell and admin alerts are pills with press; notification rows stagger. |
| 13 | Add to Home Screen prompt, What's new, offline pill | `AddToHomePrompt / WhatsNewModal / OfflineNotice` | Done (shared) | | | Offline pill bounce 0.2 set to 0. |

## B. Public (marketing)

| # | Screen | Route | Status | Before shot | After shot | Notes |
|---|---|---|---|---|---|---|
| 14 | Home | `/` | NOT audited (browser pane went hidden; see SUMMARY) | | | Left as it was. |
| 15 | Classes | `/classes` | NOT audited (browser pane went hidden; see SUMMARY) | | | Left as it was. |
| 16 | Pricing | `/pricing` | NOT audited (browser pane went hidden; see SUMMARY) | | | Left as it was. |
| 17 | Shop | `/shop` | NOT audited (browser pane went hidden; see SUMMARY) | | | Left as it was. |
| 18 | Terms | `/terms` | NOT audited (browser pane went hidden; see SUMMARY) | | | Left as it was. |
| 19 | Privacy | `/privacy` | NOT audited (browser pane went hidden; see SUMMARY) | | | Left as it was. |

## C. Auth

| # | Screen | Route | Status | Before shot | After shot | Notes |
|---|---|---|---|---|---|---|
| 20 | Login | `/login` | NOT audited (browser pane went hidden; see SUMMARY) | | | Left as it was. |
| 21 | Register | `/register` | NOT audited (browser pane went hidden; see SUMMARY) | | | Left as it was. |
| 22 | Forgot password | `/forgot-password` | NOT audited (browser pane went hidden; see SUMMARY) | | | Left as it was. |
| 23 | Reset password | `/reset-password` | NOT audited (browser pane went hidden; see SUMMARY) | | | Left as it was. |
| 24 | Verify email | `/verify-email` | NOT audited (browser pane went hidden; see SUMMARY) | | | Left as it was. |
| 25 | Verify phone | `/verify-phone` | NOT audited (browser pane went hidden; see SUMMARY) | | | Left as it was. |
| 26 | Unsubscribe | `/unsubscribe` | NOT audited (browser pane went hidden; see SUMMARY) | | | Left as it was. |
| 27 | Wrong account | `/wrong-account` | NOT audited (browser pane went hidden; see SUMMARY) | | | Left as it was. |
| 28 | Account locked | `/account-locked` | NOT audited (browser pane went hidden; see SUMMARY) | | | Left as it was. |
| 29 | Onboarding | `/onboarding` | NOT audited (browser pane went hidden; see SUMMARY) | | | Left as it was. |

## D. Student app

| # | Screen | Route | Status | Before shot | After shot | Notes |
|---|---|---|---|---|---|---|
| 30 | Home | `/dashboard` | Audited at 390px, no findings | | | Script: controls under 36px without tap, inputs under 16px, off-scale corners, horizontal overflow. Dark theme only. |
| 31 | Roadmap | `/roadmap` | Audited at 390px, no findings | | | Script: controls under 36px without tap, inputs under 16px, off-scale corners, horizontal overflow. Dark theme only. |
| 32 | Scale player | `/scales/[scaleSlug]` | NOT audited (browser pane went hidden; see SUMMARY) | | | Left as it was. |
| 33 | Practice | `/practice` | Audited at 390px, no findings | | | Script: controls under 36px without tap, inputs under 16px, off-scale corners, horizontal overflow. Dark theme only. |
| 34 | Streak | `/streak` | Audited at 390px, no findings | | | Script: controls under 36px without tap, inputs under 16px, off-scale corners, horizontal overflow. Dark theme only. |
| 35 | Leaderboard | `/leaderboard` | Audited at 390px, no findings | | | Script: controls under 36px without tap, inputs under 16px, off-scale corners, horizontal overflow. Dark theme only. Changed: rows stagger (30 ms). |
| 36 | Lessons (live class booking) | `/lessons` | Audited at 390px, no findings | | | Script: controls under 36px without tap, inputs under 16px, off-scale corners, horizontal overflow. Dark theme only. |
| 37 | Friends | `/friends` | Audited at 390px, no findings | | | Script: controls under 36px without tap, inputs under 16px, off-scale corners, horizontal overflow. Dark theme only. Changed: rows stagger (30 ms). |
| 38 | Mail list | `/mail` | Audited at 390px, no findings | | | Script: controls under 36px without tap, inputs under 16px, off-scale corners, horizontal overflow. Dark theme only. Changed: rows stagger (30 ms). |
| 39 | Mail message | `/mail/[mailId]` | NOT audited (browser pane went hidden; see SUMMARY) | | | Left as it was. |
| 40 | Profile | `/profile` | Audited at 390px, no findings | | | Script: controls under 36px without tap, inputs under 16px, off-scale corners, horizontal overflow. Dark theme only. |
| 41 | About | `/about` | Audited at 390px, no findings | | | Script: controls under 36px without tap, inputs under 16px, off-scale corners, horizontal overflow. Dark theme only. |
| 42 | Settings | `/account` | Audited at 390px, no findings | | | Script: controls under 36px without tap, inputs under 16px, off-scale corners, horizontal overflow. Dark theme only. |
| 43 | Parent | `/parent` | Audited at 390px, no findings | | | Script: controls under 36px without tap, inputs under 16px, off-scale corners, horizontal overflow. Dark theme only. |
| 44 | Parent: child view | `/parent/[childId]` | NOT audited (browser pane went hidden; see SUMMARY) | | | Left as it was. |

## E. Billing

| # | Screen | Route | Status | Before shot | After shot | Notes |
|---|---|---|---|---|---|---|
| 45 | Plans | `/billing/plans` | Audited at 390px, no findings | | | Script: controls under 36px without tap, inputs under 16px, off-scale corners, horizontal overflow. Dark theme only. |
| 46 | Payment history | `/billing/history` | Audited at 390px, no findings | | | Script: controls under 36px without tap, inputs under 16px, off-scale corners, horizontal overflow. Dark theme only. Changed: rows stagger (30 ms). |
| 47 | Receipt | `/billing/receipt/[paymentId]` | NOT audited (browser pane went hidden; see SUMMARY) | | | Left as it was. |

## F. Admin

| # | Screen | Route | Status | Before shot | After shot | Notes |
|---|---|---|---|---|---|---|
| 48 | Overview | `/admin` | Audited at 1024px, no findings | | | Script: controls under 36px without tap, inputs under 16px, off-scale corners, horizontal overflow. Dark theme only. |
| 49 | Today | `/admin/today` | Audited at 1024px, no findings | | | Script: controls under 36px without tap, inputs under 16px, off-scale corners, horizontal overflow. Dark theme only. |
| 50 | Schedule | `/admin/schedule` | Audited at 1024px, no findings | | | Script: controls under 36px without tap, inputs under 16px, off-scale corners, horizontal overflow. Dark theme only. |
| 51 | Lessons | `/admin/lessons` | Audited at 1024px, no findings | | | Script: controls under 36px without tap, inputs under 16px, off-scale corners, horizontal overflow. Dark theme only. |
| 52 | Discord | `/admin/discord` | Audited at 1024px, no findings | | | Script: controls under 36px without tap, inputs under 16px, off-scale corners, horizontal overflow. Dark theme only. |
| 53 | Accounts | `/admin/users` | Audited at 1024px, no findings | | | Script: controls under 36px without tap, inputs under 16px, off-scale corners, horizontal overflow. Dark theme only. Changed: rows stagger (30 ms). |
| 54 | Student page | `/admin/users/[userId]` | NOT audited (browser pane went hidden; see SUMMARY) | | | Left as it was. |
| 55 | Students (progress) | `/admin/students` | Audited at 1024px, no findings | | | Script: controls under 36px without tap, inputs under 16px, off-scale corners, horizontal overflow. Dark theme only. |
| 56 | Contacts | `/admin/contacts` | Audited at 1024px, no findings | | | Script: controls under 36px without tap, inputs under 16px, off-scale corners, horizontal overflow. Dark theme only. |
| 57 | Contact page | `/admin/contacts/[contactId]` | NOT audited (browser pane went hidden; see SUMMARY) | | | Left as it was. |
| 58 | Staff | `/admin/employees` | Audited at 1024px, no findings | | | Script: controls under 36px without tap, inputs under 16px, off-scale corners, horizontal overflow. Dark theme only. Changed: rows stagger (30 ms). |
| 59 | Payments | `/admin/payments` | Audited at 1024px, no findings | | | Script: controls under 36px without tap, inputs under 16px, off-scale corners, horizontal overflow. Dark theme only. |
| 60 | Payment plans | `/admin/payment-plans` | Audited at 1024px, no findings | | | Script: controls under 36px without tap, inputs under 16px, off-scale corners, horizontal overflow. Dark theme only. Changed: rows stagger (30 ms). |
| 61 | Pricing | `/admin/pricing` | Audited at 1024px, no findings | | | Script: controls under 36px without tap, inputs under 16px, off-scale corners, horizontal overflow. Dark theme only. |
| 62 | Money check | `/admin/money-check` | Audited at 1024px, no findings | | | Script: controls under 36px without tap, inputs under 16px, off-scale corners, horizontal overflow. Dark theme only. |
| 63 | Support chat | `/admin/support` | Audited at 1024px, no findings | | | Script: controls under 36px without tap, inputs under 16px, off-scale corners, horizontal overflow. Dark theme only. Changed: rows stagger (30 ms). |
| 64 | Support thread | `/admin/support/[id]` | NOT audited (browser pane went hidden; see SUMMARY) | | | Left as it was. |
| 65 | Messages | `/admin/messages` | Audited at 1024px, no findings | | | Script: controls under 36px without tap, inputs under 16px, off-scale corners, horizontal overflow. Dark theme only. |
| 66 | Sent | `/admin/sent` | Audited at 1024px, no findings | | | Script: controls under 36px without tap, inputs under 16px, off-scale corners, horizontal overflow. Dark theme only. |
| 67 | Settings | `/admin/settings` | Audited at 1024px, no findings | | | Script: controls under 36px without tap, inputs under 16px, off-scale corners, horizontal overflow. Dark theme only. |
| 68 | Security | `/admin/security` | Audited at 1024px, no findings | | | Script: controls under 36px without tap, inputs under 16px, off-scale corners, horizontal overflow. Dark theme only. |
| 69 | Activity | `/admin/activity` | Audited at 1024px, no findings | | | Script: controls under 36px without tap, inputs under 16px, off-scale corners, horizontal overflow. Dark theme only. |
| 70 | Roadmaps | `/admin/roadmaps` | Audited at 1024px, no findings | | | Script: controls under 36px without tap, inputs under 16px, off-scale corners, horizontal overflow. Dark theme only. |
| 71 | Data | `/admin/data` | Audited at 1024px, no findings | | | Script: controls under 36px without tap, inputs under 16px, off-scale corners, horizontal overflow. Dark theme only. |
