# Module catalogue

Pick from this list in the brief. Build in the order shown: each module only depends on ones above it. "BNP ref" is the
reference implementation to read first.

| # | Module | Default | Depends on |
|---|---|---|---|
| 1 | Accounts and auth | always | |
| 2 | Settings page (account, security, notifications, appearance, privacy, delete) | always | 1 |
| 3 | Notifications, email, unsubscribe | always | 1 |
| 4 | Marketing site | always | |
| 5 | Money: plans, bills, receipts | if anything is sold | 1, 3 |
| 6 | Booking and schedule | if time is sold | 1, 5 |
| 7 | Content library with access gating | if content is sold | 1, 5 |
| 8 | AI assistant with human handoff | on | 1, 3 |
| 9 | Messages (1:1, announcements) | on | 1, 3 |
| 10 | Admin console | always | all of the above that are in |
| 11 | Scheduled jobs and watchdog | always | 3 |
| 12 | Groups and families, parent accounts | LATER unless the business is family-shaped | 5, 6 |
| 13 | Referrals, discounts, scholarships | LATER | 5 |
| 14 | Gamification (streaks, badges, progress) | LATER unless learning-shaped | 7 |
| 15 | Calendar feed, push, PWA install prompt | LATER | 6 |

## 1. Accounts and auth

`User` (email unique, first and last name, phone optional and unique, role `ADMIN|MEMBER`, `emailVerified`,
`passwordHash` nullable, `sessionVersion`, `bannedAt`, `bannedReason`, `trialEndsAt`), `VerificationCode` (hashed code,
purpose enum, payload, expiresAt, usedAt, attempts), `AuditLog`, `AppSetting`, `IdempotencyKey`, `KnownDevice`.
Screens: register (server page reads trial settings, renders the client form), verify (6 boxes, `autocomplete=one-time-code`,
"Wrong email? Change it"), login (password or code), reset, account-locked. Onboarding wizard after first confirm.
BNP ref: `src/lib/auth.ts`, `verification.ts`, `pendingSignup.ts`, `(auth)/`.

## 3. Notifications and email

`Notification` (type enum, title, body, href, readAt), `EmailLog`, per-person switches (`EmailPreference` or columns)
mapped from each notification type to a category in ONE place. Bell with categories; Mail for longer messages. Every
category email carries a signed unsubscribe link (HMAC of user + category) and a `List-Unsubscribe` one-click header;
sign-in codes and security alerts never do. Emails are React-rendered HTML with a plain-text part, links tagged to the
recipient so a different signed-in account sees "Sign in with the right account". BNP ref: `notifications.ts`,
`emailPreferences.ts`, `unsubscribe.ts`, `emailLog.ts`.

## 4. Marketing site

Home (one hero with the promise and one primary button, how it works in three steps, what you get, pricing preview, FAQ,
final call to action), Pricing (from the same config the app bills with), Terms, Privacy, an interest / contact form that
lands in the admin People list. OG image, sitemap, robots. No fabricated testimonials or numbers: real screenshots or
nothing. Log in is a page (`/login?callbackUrl=`), not a slide-over.

## 5. Money

Decide the model in the brief:

- **Subscription of N sessions per cycle** (BNP): `PaymentPlan` (term in number of payments, price per bill locked at
  enrollment, `nextDueDate`, status, `pausedAt`/`pauseUntil`, `startsAt`), `Payment` (amount, status
  `OPEN|SUBMITTED|VERIFIED|REJECTED|REFUNDED|EXPIRED`, reference code shown to the payer, installment number). Cycles are a
  fixed number of days through one `addBillingCycles`. Each paid bill grants credits (`CreditGrant` with expiry, FIFO
  draw-down in a ledger). Access is DERIVED from plan state (`PAID|COMPED|TRIAL|NONE`), never a stored flag. Bill bar from
  N days before due; lapse after M late days; optional non-payment lock.
- **Credit packs**: `CreditGrant` rows from a verified payment; booking holds a credit; attendance spends it.
- **One-off bookings**: pay at booking through Checkout; the webhook confirms the booking.

Rail: **Stripe** (Checkout session per bill, webhook verifies signature and settles the `Payment` once, receipts by
Stripe or by your own receipt email) unless the user asked for manual transfer, in which case port BNP's payment email
pipeline (`paymentEmail.ts`, `paymentInbound.ts`, `docs/PAYMENT-EMAIL-FORWARDING.md`): reference code in the note, exact
amount, name or alias match, never auto-approve an unverified email.

Always: receipts (printable page + email) for verified payments only; refunds and "undo refund" audited; prices are owner
settings (`getPricingConfig()`), pure price maths take the config; a money check page that lists what does not add up.
BNP ref: `paymentPlans.ts`, `billingCycle.ts`, `entitlementRules.ts`, `creditLedger.ts`, `paymentReceipt.ts`, `moneyCheck.ts`.

## 6. Booking and schedule

`Schedule` (weekday windows, chunk length, `seats` per slot, retiredAt), `Booking` (schedule, start instant, status
`SCHEDULED|CANCELED|ATTENDED|NO_SHOW`, canceledReason), `OwnerReservation` (blocks), `SlotHold` (reminder only).
One seat-load function decides "is this time full" everywhere (`loadSeatLoad` / `countSeatUnits`). Cancel and reschedule
cutoffs as settings. Weekly plans auto-book their standing time through ONE function that respects start date, pauses
and reservations. Charge on attendance, not at booking. Reminders via the notification module. Waitlist for a full time
tells the first person only. Live sessions link: a video link or Discord channel per booking. BNP ref: `classSchedule.ts`,
`seatRules.ts`, `seatLoad.ts`, `bookingRules.ts`, `ownerReservationsAdmin.ts`, `slotWaitlist.ts`.

## 7. Content library

`Course`/`Module`/`Lesson` with files in a PRIVATE bucket served by `/api/lessons/[id]/file` (checks access, watermarks
PDFs with the viewer's name, never cached). Trial shows a slice. Optional teacher-approved unlocks. Progress per person.
BNP ref: `access.ts`, `scaleApproval.ts`, `lessonWatermark.ts`.

## 8. AI assistant with handoff

Floating widget on every page, works signed out. Server route calls the model with a system prompt built from the real
config (prices, policies) so it never invents. Thumbs up/down. A thumbs-down or "talk to a human" creates an
`Escalation` and switches the widget to live support (polling), admin replies as "Support". Model failures return a typed
503 and the widget offers the human. One-line privacy notice before typing. Signed-in chats saved 30 days; anonymous chats
not stored unless escalated. BNP ref: `AssistantWidget.tsx`, `assistant.ts`, `support.ts`, `atomFailure.ts`.

## 10. Admin console

Six sections, defined in one tested `adminNav.ts`: **Overview** (Needs you, today, this week's money), **Billing**
(Payments, Plans), **People** (one directory: accounts, form leads, added contacts; a person page with sections Overview /
Activity / Bookings / Money / Support and one Manage menu), **Schedule** (Today, Times, Requests, Attendance, Reserved),
**Inbox** (support chats, messages, sent log), **Setup** (Settings, System: jobs with Run now, activity log, data).
Never a seventh section; merge pages into tabs (`?tab=`). Phone: one bar naming the section, opening a sheet of six rows.
Every action finishes where it starts (no "go to X first"), takes the Notify switch and is audited. Destructive actions
are quiet, last in a menu, with a confirm (password + code for the irreversible ones). BNP ref: `adminNav.ts`,
`AdminNav.tsx`, `docs/ADMIN-PATTERN.md`, `needsYou.ts`.

## 11. Jobs

Start with: `job-watchdog` (30 min), `keep-warm` (5 min, no DB), `reminders` (hourly), `billing` (daily: open bills,
overdue, lapse), `expiry` (daily: credits, keys, logs), `db-backup` (nightly), `admin-daily-summary` (morning email, "all
clear" only on Mondays). Each exported as `runX = () => runJob(...)` and listed for Run now.

## 12 to 15

Port from BNP only when the brief calls for them: `familyInvites.ts` + `paymentBundles.ts` (groups pay one combined
bill, nobody joins without accepting), `parentLinks.ts` (a parent manages a child account), `referrals.ts`,
`accountDiscounts.ts`, `scholarships.ts`, `studentCalendar.ts` (signed webcal feed), `webPush.ts`, `AddToHomePrompt`.
