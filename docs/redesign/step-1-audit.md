# STEP 1 Audit

Read-only audit of the app as of `main` at 78ed2fa (2026-10-02). No code was changed.

## 1. Stack and structure

- **Framework:** Next.js 14 (App Router), React 18, TypeScript.
- **Styling:** Tailwind CSS 4, configured in CSS (no `tailwind.config` file). Tokens live in `src/app/themes.css` (color ramps, card "material") and `src/app/globals.css` (Tailwind theme, global classes, motion). Marketing pages add `src/app/(marketing)/marketing.css`.
- **Data and accounts:** Postgres via Prisma, NextAuth (email + password + emailed code).
- **Fonts:** three self-hosted fonts. Baloo 2 (rounded display face, Tailwind `font-serif`, 126 uses), Sora (body text), JetBrains Mono (labels, mostly marketing).
- **Themes:** dark ("Ink", the default) and light ("Paper"). The accent is set by `data-mode`.
- **Folders:**
  - `src/app/(marketing)`: public site (home, classes, pricing, shop, terms, privacy)
  - `src/app/(auth)`: login, register, forgot/reset password, verify email
  - `src/app/onboarding`: first-run wizard
  - `src/app/(dashboard)`: everything behind sign-in, including `/admin`
  - `src/components`: shared pieces, grouped as `ui`, `layout`, `admin`, `messaging`, `progression`, `scales`, `gamification`, and others
  - `src/lib`: business logic (access, billing, quiz, scales)

**The app shell** (`src/app/(dashboard)/layout.tsx`):
- A fixed top bar (logo, bell, avatar only) and a floating bottom **AppDock** for navigation at every screen width: Home, Online Lessons, Friends, Messages, Settings.
- A scrolling `<main>`.
- Atom (the assistant) floats bottom-right.

**Shared UI kit** (`src/components/ui`): button, input, switch, sheet, accordion, command menu, table, Skeleton, EmptyState, Toaster, ProgressRing, MetricCard, Stepper, Timeline, FileDropzone, and a few effect pieces.

## 2. Every screen

**Student side**

| Screen | Route | Main file |
|---|---|---|
| Home | `/dashboard` | `dashboard/page.tsx` |
| Scale / lesson player | `/scales/[scaleSlug]` | `CoursePlayer.tsx` + `ScaleExplorer` (piano / fretboard) |
| Online Lessons (live class booking) | `/lessons` | `ClassBookingClient.tsx`, `BookingCalendar.tsx` |
| Class schedule | `/schedule` | `ScheduleClient.tsx` |
| Friends | `/friends` | `FriendsClient.tsx` |
| Messages (1:1 + groups) | `/messages` | `MessagesClient.tsx` + `messages/components/*` |
| Settings | `/account` | `AccountSettings.tsx` (tabbed) |
| Profile | `/profile` | `ProfileEditor.tsx` |
| About | `/about` | `AboutClient.tsx` |
| Billing: plans, lesson credits, history, family | `/billing/*` | various |
| Onboarding wizard | `/onboarding` | `OnboardingWizard.tsx` |
| Spotlight tour, What's New popup, Announcement banner, Command menu | overlays | `components/layout`, `components/onboarding` |
| Auth: login, register, forgot, reset, verify | `/(auth)/*` | |
| Error / 404 | | `(dashboard)/error.tsx`, `not-found.tsx` |

**Admin side** (`/admin`, nav in `AdminNav.tsx` with 4 groups):
- Overview
- Billing: Payments, Payment Plans, Credits
- Students: Students, Users, User detail, Progress
- Operations: Schedule, Lessons, Support Chat, Announcements

**Public site:** Home, Classes, Pricing, Shop, Terms, Privacy.

## 3. What looks inconsistent or dated

- **Width (the big one):** every page picks its own narrow width. There is no shared wrapper. Details are in the 1B list below.
- **The scale page is stacked, not zoned.** The lesson list and the piano sit one under the other in a narrow column. It's a long scroll, with no side outline and no tool rail.
- **Messages and Friends are single narrow columns (~576px).** On desktop you see either the list or the chat, never both.
- **Home:** stats take a full-width row, then badges and streak take a second full-width row. The scale grid starts below the fold at 1440px.
- **Buttons:** 278 hand-written `<button>`s versus 9 uses of the shared `Button` component. So the size, padding and corner radius of buttons vary from page to page.
- **Corners:** 8 different roundings are in use (`rounded`, `-md`, `-lg`, `-xl`, `-2xl`, `-full`, and more), with no rule for which goes where.
- **Shadows:** depth mostly comes from the glass card classes plus 1px borders. That is the "flat with borders" look the plan wants to replace.
- **Empty states:** the shared `EmptyState` is used in only 3 places. Other screens write their own.
- **Loading states:** good coverage, with `loading.tsx` skeletons on almost every route.
- **Error states:** only one error screen covers the whole signed-in area. The admin, auth and onboarding areas have no error screen of their own.
- **Mobile:** works, using the floating dock and the fixed `100svh` shell, which was tuned carefully for iOS. A house rule requires every input to be at least 16px so iOS does not auto-zoom.
- **Leftover code:** `Sidebar`, `MobileTabBar`, `MoreSheet`, `TiltGlow`, and `navigation-menu` appear unused.

## 4. Color audit (green)

The green is named `amber` in the code, a leftover name. In dark mode `amber-400` = rgb(5, 233, 1). It's used about 80 times across 33 files.

There is also a **second green**: `emerald` (rgb(74, 222, 128) in dark mode), which is used for "success" on about 25 screens. To the eye, that is green being used to mean "information".

**Green that means "tap this" (keep):**
- Active state of the grid/list toggle (`ScaleViewToggle`)
- Switches (`switch.tsx`)
- Selected key (`KeySelector`)
- Active transposition (`TranspositionDashboard`)
- Selected theme (`ThemePicker`)
- Active admin nav pill (`AdminNav`)
- Atom's send button and links
- Booking calendar selected day
- The selected payment plan tier

**Green that is decoration or status (breaks Rule 2):**

| Where | What it does now |
|---|---|
| Home streak dots (`StreakDots`) | Today's dot is solid green: status, not tappable |
| "You're here" pill + green card border (`ScaleCardGrid`, `ScaleListRows`) | Status marker |
| Badges (`BadgeGrid`) | Green border/tint on earned badges |
| Unread dots (`ConversationListItem`, `GroupListItem`, `NotificationBell`) | Status |
| Pinned chat border (`PinnedGrid`) | Decoration |
| `.chip-accent` in `globals.css` | Green-tinted chip used as a label |
| Account settings notices, ManageSubscriptions, AnnouncementManager | Green-tinted info boxes |
| Admin attendance roster | Green "marked" rows |
| Every `emerald` success message (bookings, payments, profile saved, admin panels) | Status in a second green |

**Opposite problem:** the most important button on Home ("Continue") is **white**, not green. The theme's `--primary` is set to near-white on purpose. So today green is not on the main call to action. Under Rule 2 it would be.

## 5. Type sizes

**14 distinct font sizes** are in the student and admin app:

| Size | Uses |
|---|---|
| `text-xs` | 490 |
| `text-sm` | 364 |
| `text-[11px]` | 62 |
| `text-base` | 54 |
| `text-lg` | 39 |
| `text-[10px]` | 32 |
| `text-2xl` | 30 |
| `text-3xl` | 28 |
| `text-xl` | 12 |
| `text-[9px]` | 7 |
| `text-4xl` | 6 |
| `text-5xl` | 5 |
| `text-[13px]` | 3 |
| `text-6xl` | 1 |

- **"In-between" sizes** (`lg`, `xl`, `2xl`, `3xl`, about 110 uses) are the competing medium headings. They appear on Home cards, Settings sections, admin panel titles, billing, and scale cards.
- **Below the 12px floor:** `text-[9px]` (7) and `text-[10px]` (32). Found in the dock labels, streak dots, badges, the progress ring, admin tables, and message timestamps.
- **Fonts:** two text families (Baloo 2 headings + Sora body) plus a mono font.

## 6. What could break if we restyle

- **Auth:** low risk if we only touch styling. Server actions and hidden form fields must stay the same.
- **Payments:** Zelle payment modal, plan tiers, family bundle. The amounts and reference codes shown must not change.
- **Lesson playback:** the PDF viewer loads on demand (heavy). The piano, fretboard and audio (`useScalePlayer`) are timing-sensitive. Re-rendering the keyboard more often could add lag.
- **Access gating:** locked and trial scales are decided on the server. A redesign must not show locked lessons' content.
- **Messaging:** polling and unread counts. Layout changes must keep the scroll-to-bottom and typing behavior.
- **Admin permissions:** enforced by the server in `admin/layout.tsx`, not by the nav, so restyling the nav is safe. Moving to a sidebar must keep that check in the layout.
- **Onboarding tour:** points at elements by their `data-tour` attributes. Removing or renaming nav items breaks the tour.
- **iOS shell:** the fixed `100svh` shell, the 16px input rule, and safe areas were each fixed after real bugs.
- **Security policy (CSP):** fonts, images and scripts are only allowed from our own site (plus R2, Unsplash and GlitchTip). Any borrowed component that loads a CDN font or script will be blocked. Everything has to be bundled locally.

## 7. Narrow-width sources (preview for STEP 1B)

There is no single global cause. The shell itself has no max-width; **every page sets its own**:

| Width | Pages |
|---|---|
| `max-w-sm` (384px) | All auth pages (via `(auth)/template.tsx`) |
| `max-w-md` (448px) | Onboarding |
| `max-w-lg` (512px) | Billing plans, billing history, error page |
| `max-w-xl` (576px) | Messages, Friends |
| `max-w-3xl` (768px) | Online Lessons, Schedule, Profile, CoursePlayer (inside the scale page) |
| `max-w-4xl` (896px) | Settings, About |
| `max-w-5xl` (1024px) | Home, scale page, billing lessons, **the whole admin area** (one shared layout) |
| Billing layout | Vertically centers every billing page in a box |

The loading skeletons repeat their page's width separately, so the widths are duplicated.
