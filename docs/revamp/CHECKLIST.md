# Revamp checklist

One row per screen, in the order the loop runs them. 71 rows. Status: Todo, Doing, Done, Skipped (with reason). Control-level notes go in `docs/revamp/controls/<screen>.md` (one table per screen: control, measured, fix, UX laws, motion rules or n/a with reason).

## A. Shared shell and overlays (done first, every page inherits them)

| # | Screen | Route | Status | Before shot | After shot | Notes |
|---|---|---|---|---|---|---|
| 1 | Top bar (phone strip + desktop) | `TopBar.tsx` | Todo | | | |
| 2 | Profile menu | `ProfileMenu.tsx` | Todo | | | |
| 3 | Dock | `AppDock.tsx` | Todo | | | |
| 4 | Sidebar + spotlight | `AppSidebar.tsx` | Todo | | | |
| 5 | Command menu + shortcut sheet | `CommandMenu.tsx` | Todo | | | |
| 6 | Dialogs and bottom sheets | `ui/Dialog.tsx` | Todo | | | |
| 7 | Slide-over panels | `SlideOverPanel.tsx` | Todo | | | |
| 8 | Toasts | `ui/Toaster.tsx` | Todo | | | |
| 9 | Atom assistant widget | `AssistantWidget.tsx` | Todo | | | |
| 10 | Top banners (phone, Discord, practice) | `TopBanners.tsx` | Todo | | | |
| 11 | Bill bar | `BillBar.tsx` | Todo | | | |
| 12 | Notification bell + admin alerts | `NotificationBell / AdminAlertsButton` | Todo | | | |
| 13 | Add to Home Screen prompt, What's new, offline pill | `AddToHomePrompt / WhatsNewModal / OfflineNotice` | Todo | | | |

## B. Public (marketing)

| # | Screen | Route | Status | Before shot | After shot | Notes |
|---|---|---|---|---|---|---|
| 14 | Home | `/` | Todo | | | |
| 15 | Classes | `/classes` | Todo | | | |
| 16 | Pricing | `/pricing` | Todo | | | |
| 17 | Shop | `/shop` | Todo | | | |
| 18 | Terms | `/terms` | Todo | | | |
| 19 | Privacy | `/privacy` | Todo | | | |

## C. Auth

| # | Screen | Route | Status | Before shot | After shot | Notes |
|---|---|---|---|---|---|---|
| 20 | Login | `/login` | Todo | | | |
| 21 | Register | `/register` | Todo | | | |
| 22 | Forgot password | `/forgot-password` | Todo | | | |
| 23 | Reset password | `/reset-password` | Todo | | | |
| 24 | Verify email | `/verify-email` | Todo | | | |
| 25 | Verify phone | `/verify-phone` | Todo | | | |
| 26 | Unsubscribe | `/unsubscribe` | Todo | | | |
| 27 | Wrong account | `/wrong-account` | Todo | | | |
| 28 | Account locked | `/account-locked` | Todo | | | |
| 29 | Onboarding | `/onboarding` | Todo | | | |

## D. Student app

| # | Screen | Route | Status | Before shot | After shot | Notes |
|---|---|---|---|---|---|---|
| 30 | Home | `/dashboard` | Todo | | | |
| 31 | Roadmap | `/roadmap` | Todo | | | |
| 32 | Scale player | `/scales/[scaleSlug]` | Todo | | | |
| 33 | Practice | `/practice` | Todo | | | |
| 34 | Streak | `/streak` | Todo | | | |
| 35 | Leaderboard | `/leaderboard` | Todo | | | |
| 36 | Lessons (live class booking) | `/lessons` | Todo | | | |
| 37 | Friends | `/friends` | Todo | | | |
| 38 | Mail list | `/mail` | Todo | | | |
| 39 | Mail message | `/mail/[mailId]` | Todo | | | |
| 40 | Profile | `/profile` | Todo | | | |
| 41 | About | `/about` | Todo | | | |
| 42 | Settings | `/account` | Todo | | | |
| 43 | Parent | `/parent` | Todo | | | |
| 44 | Parent: child view | `/parent/[childId]` | Todo | | | |

## E. Billing

| # | Screen | Route | Status | Before shot | After shot | Notes |
|---|---|---|---|---|---|---|
| 45 | Plans | `/billing/plans` | Todo | | | |
| 46 | Payment history | `/billing/history` | Todo | | | |
| 47 | Receipt | `/billing/receipt/[paymentId]` | Todo | | | |

## F. Admin

| # | Screen | Route | Status | Before shot | After shot | Notes |
|---|---|---|---|---|---|---|
| 48 | Overview | `/admin` | Todo | | | |
| 49 | Today | `/admin/today` | Todo | | | |
| 50 | Schedule | `/admin/schedule` | Todo | | | |
| 51 | Lessons | `/admin/lessons` | Todo | | | |
| 52 | Discord | `/admin/discord` | Todo | | | |
| 53 | Accounts | `/admin/users` | Todo | | | |
| 54 | Student page | `/admin/users/[userId]` | Todo | | | |
| 55 | Students (progress) | `/admin/students` | Todo | | | |
| 56 | Contacts | `/admin/contacts` | Todo | | | |
| 57 | Contact page | `/admin/contacts/[contactId]` | Todo | | | |
| 58 | Staff | `/admin/employees` | Todo | | | |
| 59 | Payments | `/admin/payments` | Todo | | | |
| 60 | Payment plans | `/admin/payment-plans` | Todo | | | |
| 61 | Pricing | `/admin/pricing` | Todo | | | |
| 62 | Money check | `/admin/money-check` | Todo | | | |
| 63 | Support chat | `/admin/support` | Todo | | | |
| 64 | Support thread | `/admin/support/[id]` | Todo | | | |
| 65 | Messages | `/admin/messages` | Todo | | | |
| 66 | Sent | `/admin/sent` | Todo | | | |
| 67 | Settings | `/admin/settings` | Todo | | | |
| 68 | Security | `/admin/security` | Todo | | | |
| 69 | Activity | `/admin/activity` | Todo | | | |
| 70 | Roadmaps | `/admin/roadmaps` | Todo | | | |
| 71 | Data | `/admin/data` | Todo | | | |
