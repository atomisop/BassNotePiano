# Engineering memory, Bass Note Piano

Technical/engineering context for working in this repo. For product
positioning, brand voice, and business rules, see `PRODUCT.md`, this file
doesn't repeat that, it covers architecture, conventions, and how to
actually get a change safely merged.

Written after catching up on a large amount of history I (this session)
wasn't present for, treat anything below as current as of the `main` HEAD
it was written against, and re-verify anything load-bearing (prices, a
model shape, a nav label) against the actual code before relying on it,
since this file will drift.

## Stack

Next.js 14 (App Router) · React 18 · TypeScript 5 · Tailwind 4 · Prisma 5 +
Postgres (Neon in prod) · NextAuth 4 (JWT sessions, credentials-only,
password + emailed 6-digit code, no OAuth) · Netlify (hosting + deploy) ·
Google GenAI (Gemini) for the Atom assistant · Resend (email) · Cloudflare
R2 via `@aws-sdk/client-s3` (lesson media, avatars) · GlitchTip (error
monitoring, **not Sentry.io**, despite the `@sentry/nextjs` SDK package
and `sentry.*.config.ts` filenames; the DSN just points at GlitchTip's
self-hosted-compatible endpoint) · Discord (live lessons happen there now,
**not Zoom**, `src/lib/discord.ts`).

Node 24 pinned (`.nvmrc` / `engines`). A Vitest suite lives in `tests/`
(`npm test`: pure logic and the calendar routes, no database) and runs in CI.
`tests/db/` holds tests that need a real migrated Postgres (booking rules, support
cases, payments, login codes, the mail check, backups): `npm run test:db`, which
refuses to run against anything but a local database, and which CI runs after the
build has migrated its throwaway Postgres. `tsc --noEmit`, `next lint`, `next build`
and both test runs are the correctness gates, plus manual verification (see below). Every
scheduled Netlify function (except `keep-warm`, which requests `/login` every 5 minutes so the server never sleeps and must never touch the database; see docs/SPEED-AUDIT.md) wraps its body in `runJob` (`src/lib/jobRun.ts`) so
the owner overview and the morning email can show a job that stopped. A job that
never ran counts as stopped once the system has been recording longer than its
window. `job-watchdog` (every 30 minutes) checks them all, emails the owner at
once, and pings the outside monitor in `HEALTHCHECK_PING_URL` (healthchecks.io,
`/fail` when something is stopped), so a dead scheduler, database or site is
noticed from outside; the morning email is only a Monday "all clear" on quiet
days. A daily `mail-chain-probe` job sends a test email to music@ (subject `BNP mail check <token>`); the Mailgun route records its arrival (`src/lib/mailProbe.ts`, rows in `JobRun`), and the watchdog raises a problem naming the links to check if one never arrives. A nightly `db-backup` job (`netlify/functions/db-backup.ts`) writes an encrypted copy of every table to R2 under `backups/` (key in `BACKUP_ENCRYPTION_KEY`, restore with `scripts/restore-backup.mjs`, see `docs/AVAILABILITY.md`); it is a watched job, so a failure or a stop reaches the owner. Unhandled server errors reach GlitchTip through `onRequestError` in
`src/instrumentation.ts`; code that catches an error and answers 500 should call
`reportError` (`src/lib/reportError.ts`) instead of only `console.error`.

## Repo shape

- `src/app/(marketing)`, public pages: home, `/classes`, `/pricing`,
  `/shop` (recommended instrument gear, external links), `/terms`,
  `/privacy`.
- `src/app/(auth)`, login/register/reset/verify, credentials-only.
- `src/app/(dashboard)`, everything behind a session: `/dashboard`,
  `/scales/[slug]` (the course player), `/lessons` (live class booking),
  `/billing/*`, `/friends`, `/messages` (1:1 + group), `/account`
  (tabbed settings, password, notifications, appearance, tutorials,
  **Delete Account** danger zone), `/profile`, `/about`.
- `src/app/(dashboard)/admin`, the sole admin's console. The menu is six choices and NINE pages (2026-11-10, defined in `src/lib/adminNav.ts`, tested): Overview; Billing (Payments, Plans);
  People (People); Classes (Schedule, Lessons); Inbox (Inbox); Setup (Settings, System). Every other page is a view of one of these, switched by pills (`SectionPills`, `?section=`) or the page's own
  tabs: Payments holds Unmatched emails, Class credits and Check (`?tab=`); Plans holds Prices and Scholarships; People holds Class form, Added and Staff (`?filter=`) and has the Add person button;
  Schedule holds Today (`?view=TODAY&day=`), Times, Requests, Attendance and Reserved; Lessons holds Roadmaps and Discord; Inbox holds Chats and Messages (Direct, Announcements, Sent); System holds Activity
  and Data. A moved page keeps its code in a `_view.tsx` next to its old address, which only redirects (`intoParams`), so old links, emails and notifications still work. Merge the same way when two pages
  describe one job; never add a tenth page. `AdminNav` (`src/components/admin/AdminNav.tsx`) is a six-item list from md up and, on phones, one bar naming the section that opens a sheet of six equal rows;
  `AdminSectionTabs` draws a section's pages as one underlined tab row above every page (hidden when the section has one page; a dot marks a tab with something waiting). Pages keep their own filter pills for statuses.
- Booking code: `src/lib/classSchedule.ts` (booking, cancel, reschedule and the
  shared time and slot rules), `classScheduleAdmin.ts` (roster, attendance),
  `classScheduleManage.ts` (adding and retiring weekly slots), `bookingRules.ts`
  (rules the browser shares, such as the one-credit-class-a-week limit for
  subscribers).
- `src/components/assistant/AssistantWidget.tsx`, Atom, the floating
  assistant on every page (mounted once in `providers.tsx`). See "Atom /
  Support Chat" below, this has had several rounds of follow-up fixes
  since it first shipped.
- `prisma/schema.prisma` + `prisma/migrations/`, every migration is a
  hand-written `.sql` file (see "Migrations" below, this is not incidental).

## Migrations, always hand-written, always verified against a real Postgres

No session so far (including this one) has had live credentials to the
production Neon database. Every schema change in this repo's history was
written as raw SQL by hand, matching Prisma's own conventions exactly
(`CREATE TYPE`/`ALTER TYPE ... ADD VALUE`, `CreateTable`/`AddForeignKey`
comment-headers, FK names as `Table_field_fkey`), then verified, not just
assumed correct, against a locally-installed throwaway Postgres before
ever being pushed:

```
service postgresql start   # or: pg_ctlcluster 16 main start
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'postgres';"
sudo -u postgres psql -c "CREATE DATABASE bnp_verify;"
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/bnp_verify?schema=public"
export DIRECT_URL="$DATABASE_URL"
npx prisma migrate deploy        # applies the FULL migration history in order
npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script
# must print "-- This is an empty migration.", i.e. zero drift from schema.prisma
```

Drop the throwaway database afterward. This is the one reliable way to know
a hand-written migration is actually byte-correct before it ever touches a
real database, `prisma migrate diff` against the applied result catching
zero drift is the bar, not "it looks right."

**The build now actually runs migrations in production.** `package.json`'s
`build` script is:
`sh -c 'if [ -n "$DATABASE_URL" ]; then npx prisma migrate deploy; fi' && next build`,
guarded so an environment with no `DATABASE_URL` (a contributor's bare
`npm run build`, some future CI context) still builds exactly as before.
This exists because for a while it *didn't*, a whole PR's worth of new
tables (Atom's feedback/escalation system) shipped to `main`, and nothing
in the deploy pipeline ever actually migrated the production database, so
the feature silently 500'd for the user in production despite passing every
local check. The CI workflow (`.github/workflows/ci.yml`) now also runs a
real `postgres:16-alpine` service so `npm run build`'s migrate-deploy step
has something to reach in CI too. If a future migration-related bug shows
up in production again, check the Netlify deploy log's migrate-deploy
output first, before assuming the code is wrong.

## Atom / Support Chat

Atom (`src/components/assistant/AssistantWidget.tsx`, `src/lib/assistant.ts`
for the Gemini call + system prompt) is a public, no-login-required chat
widget. Layered on top of it, entirely deterministic (never LLM-decided):

- Thumbs up/down under every reply (`/api/assistant/feedback`,
  `AssistantFeedback` table), changeable, not locked after one click.
- A triage: a thumbs-down or a plain-English "talk to a human" hands the
  conversation to `/api/assistant/escalate`, which creates an
  `AssistantEscalation` + seeds `SupportMessage` rows from the pre-handoff
  transcript, and notifies every admin (`Notification` type
  `ASSISTANT_ESCALATION`).
- From there the widget is in **live support mode**: it polls
  `/api/assistant/support/[id]` for new messages instead of calling the
  LLM. Senders are `VISITOR` / `ATOM` / `SUPPORT`, an admin's reply is
  always `SUPPORT`; the replying admin's real identity (`sentById`) is
  recorded for internal accountability only and is never present in
  anything the visitor-facing route returns. A signed-in visitor's thread
  is locked to their own session (`loadEscalationForVisitor` in
  `src/lib/support.ts`); an anonymous one trusts the unguessable escalation
  id as a bearer credential, same trust model as elsewhere in this app.
- Email to `music@bassnotepiano.com` (MX is Mailgun) arrives in the same tables
as an `EMAIL`-source thread (`AssistantEscalation.source`), shown in the Email
tab of `/admin/support`. A Mailgun route posts each message to
`/api/inbound/mailgun` (signature checked with `MAILGUN_SIGNING_KEY`, Message-ID
deduped, automated mail and rate limits dropped, `ingestInboundEmail` in
`support.ts` threads it by In-Reply-To/References then sender + subject).
An admin reply on an email thread is sent first as `music@` through Resend
(`sendSupportEmailReply`) and only stored if the send worked. Email threads are
never visible to the visitor-facing chat routes (`loadEscalationForVisitor` and
`/api/assistant/support/active` filter to `CHAT`). The old Gmail-script
`forwardStudioMail` bridge is gone; only `forwardPaymentEmails` remains.

The admin side is `/admin/support` (`src/app/(dashboard)/admin/support/`,
  `src/components/admin/SupportChatPanel.tsx`), a two-pane live inbox with
  polling, an unread indicator, and "Mark resolved." Replying again after
  resolved naturally reopens the thread.

**This has been fixed forward multiple times since it first shipped**,
commit history includes "Fix Atom getting stuck on a conversation support
already closed," "Support chat: fix stale thread switching, add permanent
delete," and "Fix support chat showing the wrong thread's messages while
loading." There's also a migration named
`add_assistant_conversation_history` after the original Support Chat one,
re-read `src/lib/support.ts` and the current `SupportMessage`/
`AssistantEscalation` shape directly before assuming the design above is
still exactly accurate; treat this section as "how it was built," not a
guarantee of the current byte-for-byte shape.

When Gemini refuses or cannot be reached, `generateContent` throws a typed
`GeminiError` (`src/lib/atomFailure.ts`, classified as credits, key, busy or
other). The chat route answers 503 with `code: "atom_unavailable"` and a plain
message, and the widget then offers the handoff to a person. `recordAtomFailure`
(`src/lib/atomHealth.ts`) emails the owner at once for credits or key problems
(or after 5 temporary failures in 10 minutes), at most every 12 hours, with one
"answering again" email on recovery; the state is `atom-alert` rows in `JobRun`
and shows as an item in the admin alerts button ("Needs you").

A **separate** persistence mechanism now also exists for ordinary (non-
escalated) Atom chats, per the current system prompt in
`src/lib/assistant.ts`: a signed-in visitor's regular conversation with Atom
is saved to their account and readable under Settings → Privacy & Data,
auto-deleting after 30 days; an anonymous visitor's ordinary chat is never
stored server-side at all (only an escalated one is, via the mechanism
above, that's a deliberate, disclosed exception, since a human then needs
to read it). Atom currently teaches piano/guitar/bass only, drums and
voice are "coming soon" on the public interest-registration form, and the
system prompt explicitly forbids implying either is bookable today.

## Payment emails: how a bank email finds its payment

`src/lib/paymentEmail.ts` settles a payment only when the email's amount equals the
payment's exactly AND either the note carries that payment's reference code
(`paymentReferenceCode`, "BNP-" + last 5 of the id, shown on the pay screen) or the
sender is the account holder or a `PayerAlias`. A note naming a *different* payment's code
never matches by name. Two matches with no code settle nothing. A `PayerAlias` is created
only when an admin attaches an email by hand (`matchReceiptToPayment`), is shown and
removable on `/admin/users/[id]`, and needs two words. An email whose name matches exactly
one student's open payment but whose amount is different sends that student a
`PAYMENT_AMOUNT_MISMATCH` notice (routed to Mail). `job-watchdog` also reports a quiet
payment-email pipeline (`findPaymentPipelineProblem`), with a constant line so it alerts once.
Accounts now need a first and last name (`src/lib/studentName.ts`).

**A forwarded email that FAILS the sender signature check is still read** (`holdUnverifiedPaymentEmail`): if it carries a real payment's BNP code AND that payment's exact amount, that one payment moves to "waiting for your approval" with a note and an admin alert, and is never auto-approved; anything else is ignored with the old alert.

**Soft trust**: when Mailgun gives NO verdict (not a failure) but the message carries a signature from the sender's own domain and Gmail recorded the bank's signature as passing (`checkForwardedBankMail().soft`), the email is read like a verified one and anything it settles stays in the owner's "unchecked" list (`ingestPaymentEmail(..., { forceCheck: true })`). An explicit failure, another domain, or no Gmail hint still only reaches the hold path above.

**Venmo is no longer accepted (2026-11-12, the owner).** The payment sheet offers Zelle only (no Venmo tab, link or QR), `submitZellePaymentReference` always stores `method = ZELLE`, and every sentence a person reads says Zelle. The `VENMO` enum value, the Venmo email parser and the "Venmo" label on old payments, receipts and history stay on purpose: rows and emails that already exist still have to read correctly, and a stray Venmo email is still understood. `NEXT_PUBLIC_VENMO_HANDLE` is no longer read.

**Sign in with Google (2026-11-12, `docs/GOOGLE-SIGNIN.md`, `src/lib/googleSignIn.ts`, `GoogleSignInButton`)** is a second way to get a session, switched on only when `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set. The NextAuth `signIn` callback in `auth.ts` runs `resolveGoogleUser`, which refuses an unverified Google email, an admin, a child account, a banned or payment-locked account; a never-confirmed password account is confirmed AND its password removed; a new person gets a student account with no password (they add one through Forgot password, and Settings says so). The credentials provider is still the only path for admins. Do not make Google bypass the admin two-step or the child rule.

**Payment emails arrive by forwarding** (added 2026-10-10, `docs/PAYMENT-EMAIL-FORWARDING.md`): Gmail forwards bank/SoFi/Venmo mail to
the private address `pay-<PAYMENT_INBOX_TOKEN>@inbox.bassnotepiano.com`; a Mailgun route posts it to `/api/inbound/payments`, which
checks the private address, Mailgun's signature, a bank sender domain and the bank's own DKIM signature aligned with the sender
(`src/lib/paymentInbound.ts`), then calls `ingestPaymentEmail`. The Gmail script is the slow backup; both use the RFC Message-ID
(`normalizeMessageId`), so an email is counted once.

The owner's own transfers between their accounts (SoFi writes "sent to you by <owner name>") are skipped: `payments.ignoreSenderNames`
(Settings > Payments, full names only, exact match, a payment code in the note still wins), added to by "Always ignore this sender" on an
unmatched email (owner only, `ignoreSenderFromReceipt`), `src/lib/ignoredSenders.ts`.

## Curriculum access: live classes only (as of 2026-09-25)

The curriculum is **not sold on its own anymore.** It comes with live
classes, and the old $69.99 purchase is gone (`/billing/curriculum` just
redirects to `/billing/plans`). Access is *derived*, never a stored purchase:

- `src/lib/entitlementRules.ts` (pure, edge-safe) and
  `src/lib/entitlement.ts` (DB) resolve a student to `ADMIN | PAID | COMPED |
  TRIAL | NONE`. `PAID` = a Payment Plan with at least one approved
  installment, through the end of the paid period (+3 days grace). Cancelling
  keeps access to the end of the paid 4 weeks. A COMPLETED plan (every 4-Week
  one) does not advance `nextDueDate` on its last installment, so its paid
  period ends one 28-day cycle *after* it (easy to get wrong, it was).
- `User.hasCurriculumAccess` is now only the admin's complimentary override
  (`COMPED`). The migration cleared every existing flag (they were all free
  grants). The JWT's copy is display-only; the edge no longer gates scales.
  `getRoadmap`/`canAccessScale` in `src/lib/access.ts` (DB-authoritative) are
  the real gate, via `decideScaleAccess`.
- **Billing cycles are 28 days (decided 2026-10-24).** Every payment plan is billed every 4 weeks, never by calendar month: one payment covers exactly 28 days, so a cycle always holds exactly four of any weekday. `addBillingCycles` / `BILLING_CYCLE_DAYS` (`src/lib/billingCycle.ts`, tested) is the only place a cycle's length is defined; the paid period, the next due date and the credits' expiry all go through it, so never add months to a billing date. The price per payment did not change. The offer is worded exactly this way everywhere: billed every 28 days, and each bill pays for exactly 4 classes. Plans are NAMED 1 Month (no commitment), 3 Months (3 payments) and 6 Months (6 payments) (decided 2026-10-24: a 28-day cycle is sold as a month, off only by days), while billing copy says "every 28 days", never "monthly" or "4 weeks"; `termMonths` in the code means the NUMBER OF PAYMENTS, not months. The old fifth-class offer and free credit are switched off (`FIFTH_CLASS_RETIRED` in `paymentPlans.ts`; a fifth class already given is still honored). Migration `20261106000000_billing_28_day_cycles` moved plans that were mid-cycle onto 28 days (due dates, live credits, a bell notice each); `tests/db/billing28Migration.test.ts` runs that file against realistic rows. Referral discounts still last 3 calendar months (they are a promotion, not a bill).
- **Teacher-approved drip.** Full access opens Scale 1 only. Each next scale
  opens when the teacher approves it (`approveNextScale` in
  `src/lib/scaleApproval.ts`, button on `/admin/progress`): eligible when the
  previous scale's checklist is complete and 7+ days passed since the last
  unlock; the admin can force past both. Approval sets
  `ScaleProgress.unlockedAt`, which only counts while entitlement is active.
- **Free trial**: every new account starts it when its email is CONFIRMED (`startTrialForEmail`
  in `verifyEmailAction`, not the register route; moved 2026-11-12 so the 3 days never run while someone waits for their code, and the once-per-inbox
  marker is only spent on a real inbox; accounts made before that keep the trial they already had): `User.trialEndsAt` (3 days, once per
  person and per inbox, never cleared; off with `trial.enabled`). Trial opens only Scale 1's first 3 lessons
  (`TRIAL_LESSON_COUNT`), no practice/quiz; locked lessons are sent to the
  client as titles only.
- **Yearly (`TERM_12`) is retired** for new enrollments
  (`isPlanTermOffered`), enum value kept for existing rows. Note that term
  discounts are still not a real commitment: a student can self-cancel.
- **Lesson files are served by the app** (added 2026-10-13, `docs/PRIVATE-LESSON-FILES.md`): the player and download links use
  `/api/lessons/[lessonId]/file`, which checks access (trial slice included), stamps the student's name and email on every PDF page
  (`lessonWatermark.ts`) and is never cached. Lessons live in a private bucket (`R2_PRIVATE_BUCKET_NAME`, `fileUrl` = `private:<key>`);
  until that is set and `scripts/move-lessons-private.mjs` has run, the old public addresses still work through the same route.

## One combined bill per cycle for a group (added 2026-11-02, `paymentBundles.ts`)

A group (family plan or parent mode) with two or more open 28-day bills pays ONE bill: a `FAMILY_PLAN_INSTALLMENT` payment owned by the group's payer, amount = the members' bills added up (a pause or discount just changes a member's own amount). Each member keeps their own bill row (it carries their credits and plan progress) but while it is open it points at the combined bill (`ZellePayment.bundleId`). `getOrCreateOpenInstallmentPayment` opens every started member's due bill, then `syncGroupBundle` builds, updates or dissolves the combined bill (fewer than two open bills, or a plan ended, dissolves it; a solo plan never joins one). Approving the combined bill (through `approveZellePayment`, so admin approval, auto-approval and bank-email matching all work) approves every member bill with `skipReceipt` and sends ONE receipt to the payer listing each person's part. A bank email is matched to the combined bill by the payer's name and the total; bundled member rows are left out of every matching query (`bundleId: null`). Revenue sums skip `FAMILY_PLAN_INSTALLMENT` rows so money is counted once (on the member rows); the admin list and a person's history show the combined bill, not its members. Only the payer ever pays or submits: a member (a child) is refused server-side and never sees a pay button, and the daily installments job notifies the payer with the pay button and, in a family group (not parent mode), the other members at the same moment with "nothing for you to pay". Refunding the combined bill refunds each member bill. `expireSettledGroupStarts` (daily `credit-expiry`) closes a group's combined FIRST payment once every member is already paid.

## Owner controls for money (added 2026-11-02)

Owner only, all audited (`payment.refund-undone`, `payment.cancel-bill`, `plan.progress`): **Undo refund** on a refunded payment in Billing > Payments (`undoRefundZellePayment`; optionally gives back the credits the refund took and runs the plan again if the refund ended it; classes canceled with it are not restored; a refunded combined group bill undoes every member bill). **Cancel bill** closes an unpaid or rejected bill as EXPIRED and keeps the record (`cancelOpenBill`; Delete still removes a row). **Plan progress** on the student page (`setPlanProgress`, `AdminPlanProgressButton`) sets bills paid and the next bill date with none of the bill-date limits (any date, a past one too; a finished plan reopens), closes unpaid bills, and never touches credits or booked classes. Refund a bill without ending its plan and the admin is warned the plan still counts it.

**Money check** (Admin > Billing > Check, `/admin/money-check`, owner only, `src/lib/moneyCheck.ts`): lists what does not add up (a plan whose bills paid differs from its really paid bills, an open bill nobody owes, a group's combined first payment still open though every member paid), each with a two-step button (`applyMoneyFix`, re-checks first, quiet: the student is not told). Run against the live data on 2026-11-02 after the manual fixes it found nothing. A new kind of check goes in `findMoneyIssues` with a test in `tests/db/moneyCheck.test.ts`.

## Family plans (added 2026-10-14, `docs/FAMILY-PLANS.md`)

2 to 8 accounts (`MIN_FAMILY_MEMBERS` / `MAX_FAMILY_MEMBERS` in `classCreditPricing.ts`, shared by the form and the server), one `PaymentPlan` each at the family rate (`FamilyPlanGroup`), all created in one transaction (any member that cannot start
stops everyone). The payer pays one combined `FAMILY_PLAN_START` first payment whose approval starts every plan at once; from month two each
member has their own bill. Only the payer's bank account settles family money (`familyPayerOf`). A failed start lapses the whole group.
The old one-payment `FAMILY_BUNDLE` page now redirects to `/billing/plans`.
A subscribed payer switches in (`FamilyPlanGroup.replacesPlanId`): password plus emailed code, the old plan runs until the combined payment is
approved and is then replaced in the same transaction. A member leaving one short of two bills the survivor at the solo price; the payer
leaving ends the family (members keep the month paid). One family change per `family.changeCooldownDays`.

**Nobody is put on a family without saying yes (2026-10-24, `familyInvites.ts`, table `FamilyInvite`).** The payer invites an existing account from the plan form (or the switch panel); the invitee sees Accept / Decline on their own Billing > Plans screen (`FamilyInvitesPanel`) and gets a bell notice. `createFamilyPlans` refuses unless every other member has an ACCEPTED invite from THIS payer made within `FAMILY_INVITE_DAYS` (7); the invites are deleted when the family is created, so a yes starts one family only. A decline blocks asking again for 30 days. Nothing (no plan row, no held slot) exists for an invitee until they accept and the payer pays.
**Two more guards in the same place**: `assertNotHoardingTimes` stops anyone who started `MAX_UNPAID_STARTS_PER_WEEK` (3) plans in 7 days without paying one; and the screen sends the first payment it showed (`expectedFirstPaymentCents`), the server refuses with `PRICE_CHANGED_MESSAGE` if the real price differs and the screen reloads the prices. The live account check (`familyMemberCheck.ts`) answers a banned or admin email exactly like a missing one.

## Contacts and soft holds (added 2026-10-20)

Admin > People (`/admin/users`, one page since 2026-11-10: Accounts and Contacts were merged; `/admin/contacts` only redirects, its detail pages and actions stay; `src/lib/contacts.ts`, `DirectorySection`) lists every account, then under "Not signed up yet" the people with no account, with pills Class form and Added and an Add person button. The directory is one list of everyone: accounts (classes taken, next class,
the weekly time a payment plan reserves), people who sent the class form and have no account (`ClassRegistration`, shown as "Class form" with Call / Text / Email and Remove), and people added by hand (`Contact`, with a status, notes
and a `ContactSession` log of the days they took a class). A `SlotHold` keeps one weekly hour (schedule + `chunkIndex`, optional `until`) for a
contact. It is a reminder only: nothing in `classSchedule.ts` reads it, so it never blocks a booking. Every admin time picker shows it
("Held for X") and asks before taking it: Book a class and Reschedule on the student page, Set up plan and Weekly time (`holdAppliesTo` in
`slotHolds.ts`). A hold for the same email is preselected in Set up plan and released when the plan is set up. Admin only; students never see a
contact's name. A contact with an account appears once in the list (merged by email).

## No class applications (removed 2026-11-09)

The public class form (`/classes`, `submitClassRegistration`) only collects details: there is no approve or reject, no Applicants page
(`/admin/students` redirects to `/admin/contacts?show=application`), no auto-approve switch, and nothing counts "applications" anymore.
The visitor sees the smiling `PianoCat` ("An instructor will reach out to you soon"), the owner gets the `NEW_REGISTRATION` alert, and the
teacher reaches out outside the app from the Contacts entry. The free trial no longer waits on an approval: every new account gets it.

## Daily practice in the admin (added 2026-10-14)

The teacher sees each student's daily 10-minute finger practice (`FingerPracticeDay`) in two places, read only: a "Daily practice" card
on `/admin/users/[id]` (30-day dot strip, streak, minutes this week) and an "x/7 practice" figure plus a "Not practicing" tab on the People
list (`/admin/users`). Practice is only expected of people with full curriculum access who are not the admin. Logic is in
`practiceActivityRules.ts` (pure) and `practiceActivity.ts` (queries).

## Phone numbers (added 2026-10-09)

Everyone is asked for a phone number (sign-up form, a top-of-screen banner for older accounts at most once a day, Settings → Account).
By default it is **kept as typed and not verified**: `assessPhone` (`src/lib/phoneValidity.ts`, libphonenumber
metadata) checks it could really exist (real area code, right length, no filler or 555-01xx numbers). That
proves nothing about the line being active or theirs; only a text code or a paid line lookup can.

- `User.phone` IS unique (one number, one account), so nobody can put an enrolled student's number on their own account; the cost is that whoever types a number first holds it, so an admin can clear one on the student page (`adminClearPhoneAction`). `phoneVerifiedAt` is set only by text confirmation.
- **Payment sheet** (`ZellePaymentModal`) asks for the phone BEFORE showing the code. The number must equal the paying account's own (`checkPaymentPhone`, live server check behind the green check; the sheet only ever gets the last four digits), or, for an account with none, be real and untaken, typed twice, and is then saved to the account. It is stored on `ZellePayment.senderPhone`. Owner setting `payments.askPhone`.
- **Payments** (`src/lib/paymentEmail.ts`). The bank emails (SoFi for Zelle, Bank of America, Venmo) carry the sender's
  full legal NAME, the exact AMOUNT and the sender's NOTE; they do NOT carry a phone number (checked against a real SoFi
  email, 2026-10-09). SoFi's wording ("The $X sent to you by NAME will be automatically deposited...", note below it) is
  read from the BODY by `parseSofi`; the subject is not relied on, and the Gmail script finds SoFi mail by that
  sentence. A bank email claims an open payment, strongest first: `code` (BNP code in the note), `name`
  (`namesMatch`: case-insensitive, middle names, initials, at least one whole word), `phone` (only if an email ever
  shows a whole number equal to the one typed for the payment), `amount` (the exact amount alone: exactly one payment
  open for it, opened within 3 days, the note does not name another payment, the sender is not a known person on
  another account; owner setting `payments.matchByAmount`, on by default). Prices end in .99, which nobody sends by
  accident. `phone` and `amount` clears are left UNCHECKED (`checkedAt` null) so the owner reviews them, and
  `ZellePayment.matchedVia` records which way in was used (shown in the admin queue). A name match whose phone
  disagrees is held for an admin. Phone-at-payment (`payments.askPhone`) is OFF by default since emails have no phone.
  Hardening (2026-10-09): the same softer rules (typo'd code, exact amount alone) also run when the student submits
  AFTER the money email arrived (`settleWithStoredReceipt`), so the order does not decide the outcome; one student's
  look-alike open payments (same amount) clear oldest-first (`oldestOfSameStudent`, flagged unchecked); a note code
  one typo from exactly one same-amount payment and not equal to any open payment's code clears as `codeTypo`
  (unchecked); the Venmo note falls back to a line with the code or "Bass Note Piano"; and a bank email that looks
  like a payment (has a $ amount) but cannot be read raises the admin alert `PAYMENT_EMAIL_UNREADABLE` once per email
  (marker rows `payment-email-unreadable:<id>` in AppSetting) and ingest answers "unreadable".
- **Optional text confirmation** (owner setting `phone.verifyBySms`, OFF by default, needs `PLIVO_*` env):
  shared code system with `VerificationPurpose.PHONE_VERIFY`; `src/lib/sms.ts` talks to Plivo Verify, which makes,
  texts and checks the code (we store only a session row). New accounts made while it is on get
  `phoneRequired` and are sent to `/verify-phone` by `(dashboard)/layout.tsx` and `onboarding/page.tsx`. Without
  Plivo keys in production it can never turn on (`smsAvailable()`), so nobody gets locked out. In development
  the code is printed to the server log. There is NO free production SMS service.
- Settings (`/account`) has one "Account" choice that holds every account item in groups (profile, contact,
  sign-in and security, connected accounts, classes and reminders, family and offers, privacy and data incl. download, delete;
  regrouped 2026-11-10, each card showing its current value under its title). The content is rendered
  twice (desktop column and phone slide-over), so never use DOM ids inside it.

Top-of-screen banners (`IosBanner`, `TopBanners` in `components/ui/`, mounted in `(dashboard)/layout.tsx`) look like an iPhone
notification and show one at a time, **only on Home and at most one per slot in all (2026-10-30; the practice banner never shows, Home's hero says it)**, only while the tab is visible and never over the tour or the "what's new" popup. **Each banner (phone number,
Discord, practice) pops up at most once per slot, four slots a day six hours apart from 8am: 8am, 2pm, 8pm and 2am by the viewer's own clock**
(`src/lib/bannerSlots.ts`; the slot a banner last showed in is in localStorage `bnp-banner-slot-<kind>`). Every time one pops up the browser tells
`/api/me/banner-notice`, which keeps that reminder in the person's bell (`BANNER_PHONE` / `BANNER_DISCORD` / `BANNER_PRACTICE`, grouped under
Reminders, once per banner per slot, `src/lib/bannerNotices.ts`), so closing the banner never loses it. The owner settings `discord.promptRepeatMinutes`
and the practice repeat minutes no longer set the timing (the slots do); `phone.promptSeconds` and the `discord.prompt*` lengths and on/off switches still apply.

## Staying in sync across the app (added 2026-10-10, `docs/SYNC-AUDIT.md`)

- **One credit is one 45 minute class.** Balances are STORED in half-classes (`CREDITS_PER_CLASS`). Never show or accept a stored
  number: convert with `storedToCredits`, `creditsToStored`, `creditsLabelFromStored`, `formatCredits` (`classCreditPricing.ts`).
- **Shared live status:** the top bar credit badge (the 21st.dev "Bubble Button") and the Discord, practice and phone banners read
  `useMeStatus()` (`MeStatusProvider`, `/api/me/status`). Anything that changes credits, the Discord link, practice, a message or a
  notification calls `announceChange(...)` from `src/lib/liveEvents.ts` right after its action (`messages`, `notifications`, `status`, `page`,
  or the `payments` and `booking` shortcuts) so the badges and the page update at once; see the last section of `docs/SYNC-AUDIT.md`.
- **Discord connected = the stored `discordId`** (`discordLinkState`), never the name. Every connect, disconnect and ban calls
  `revalidatePath("/", "layout")`; admin, payment, plan, credit and account actions do the same, so no screen keeps an old value.
  `staleTimes.dynamic = 0` stops the browser reusing a visited page.
- **Closing a plan closes its unpaid bill** (admin cancel, self cancel, lapse, ban). A payment already submitted stays for review.
- **User switches decide what they see.** `emailPreferences.ts` maps each kind of notice to its switch (payments, account updates, social, class updates, practice and class reminders); never send or show a notice around a switch (a payment result they are waiting on is the one documented exception). Practice and class reminders are turned on for everyone who subscribes (a data migration for those already subscribed, and `createPaymentPlan` for new ones, once, so a later opt-out sticks). The practice banner is a practice reminder: it needs the owner's `reminders.practiceEnabled` and the person's own reminders switch. A banned account is sent nothing.
- **New notices** live in `studentNotices.ts` (+ `trialNotices.ts`, run by the daily credit-expiry job). Add a new student-facing
  event there, with a `NotificationType` (enum migration), its CTA in `notifications.ts` and its category in `NotificationBell.tsx`.

## Sidebar spotlight, devices and follow-ups (added 2026-10-21)

- **Sidebar spotlight** (`SidebarSpotlight`, `src/lib/sidebarCards.ts`, `/api/me/sidebar`): the bottom of the desktop sidebar shows one card at a time (dots step
  through the rest): Discord invitation until linked, next class countdown, low credits, scale unlocked / waiting, streak, continue lesson,
  friends practicing; admins get jobs stopped, needs-you counts and today's classes. Each is a true fact with one tap; add a new kind to the `SidebarCard` union.
- **Signed-in devices** (Settings > "Where you are signed in"): `KnownDevice` rows (browser + OS, never the IP) with city/region/country from the host's geo headers
  (`placeFromHeaders`, Netlify `x-nf-geo` is unverified in production), `signedInAt`, and `lastSeenAt` touched by `/api/me/status` (about once a minute per open tab).
  Active = checked in within 5 minutes. "Sign out other devices" deletes the other rows. Sessions are JWT, so there is no per-device sign-out.
- **Follow-ups** (`adminFollowUps.ts`, the Follow up button on the Overview (`FollowUpMenu`, a dropdown of every reason; People > Accounts no longer lists them, only its filter tabs) + morning email; one-click reminders in `followUpReminders.ts`): overdue bills, not practicing, trial ending, credits
  expiring, Discord not linked. A reminder uses fixed wording, re-checks the reason, goes once per person per reason per day, and is audited (`followup.reminder`).
- **Session lookup cache**: `loadEntitlementsBounded` remembers a user's entitlements for 5 seconds per server (sign-in and `update()` read fresh; the ban check is live).
- **Admin student page** has Overview / Learning / Classes / Money / Support tabs; sections stay mounted (hidden), the tab is kept in the URL hash.
- **Top banners** never ask for what the screen already shows (`alreadyShown` in `TopBanners.tsx`): no Discord banner on Lessons or at desktop width (the sidebar card
  carries it), no practice banner on Practice, no phone banner on Settings.

## Email opt-out, Atom notice, accessibility (added 2026-10-21)

- **Unsubscribe**: every email a switch governs (anything sent through `createNotification` with an `emailCategory`, announcements and admin messages, payment-plan
  bills) carries a signed link (`src/lib/unsubscribe.ts`, HMAC of user + category, no sign-in) to `/unsubscribe` (a page that only asks) and a `List-Unsubscribe`
  one-click POST header to `/api/unsubscribe` (the only thing that changes a switch). Sign-in codes, security alerts, the welcome email, applicant replies and owner
  emails carry none, on purpose. Pass `unsubscribe: { userId, category }` when adding a new email of that kind.
- **Atom** shows one warning line before anyone types (the footer: "AI assistant. Don't share passwords or card numbers.") and the rest of the
  notice (what Atom is, that words go to Google, 30-day history, shared with the team on handoff) behind the "i" next to it, in `AssistantWidget.tsx`; keep it
  in step with `PrivacyContent.tsx` and the privacy summary in `assistant.ts`. Opened from the sidebar's Ask AI on a computer, the window sits above that
  button with a pointer (`openAtom(anchor)`).
- **Email record** (`EmailLog`, `src/lib/emailLog.ts`): every email `sendEmail` sends, fails or skips (staging, no key in dev) and every one a
  person's switch or a ban stops (`maybeSendEmail`) gets a row: address, subject, status, reason, never the body. Resend's signed webhook
  (`/api/webhooks/resend`, `RESEND_WEBHOOK_SECRET`, `verifyResendSignature`) moves it to delivered, opened, clicked, bounced or spam
  (`nextEmailStatus` never moves backward). Shown as the Email channel on Admin > Inbox > Sent; the daily `credit-expiry` job removes rows after 180 days.
- **Admin alerts**: an admin's sidebar holds the admin sections, so their spotlight cards (Discord, stopped jobs, waiting counts, today's classes) live in the
  alerts button by the profile picture (`AdminAlertsButton`, `SidebarSpotlight mode="list"`); students keep the cards at the foot of the sidebar.
- **Accessibility**: run axe-core (WCAG 2.2 AA + best-practice) against the signed-out pages, Home, Lessons, Settings, Billing and the admin screens after UI changes.
  Custom modals must use `useDialogFocus` (focus in, Tab trapped, Escape, focus back). Never put `aria-label` on a bare `p`/`span` without a role; icon targets are at
  least 24px; links inside running text are underlined.

- **Security policy reports** (`CspViolation`, Admin > Security, owner only): the strict Content-Security-Policy still runs report-only. `/api/csp-report` counts each report by rule, what was blocked (host only)
  and page (path only), capped at 500 rows; the page separates real findings from visitors' own browser extensions (`isBrowserNoise`) and says whether it looks safe to enforce (no real finding in 3 days).
  Turning enforcement on is a small follow-up (swap `Content-Security-Policy-Report-Only` for the enforced header in `middleware.ts`) once that page has stayed clean for several days of normal use.

- **Polling budget** (each open tab costs server work): one shared status poll a minute (`MeStatusProvider` / `/api/me/status`, now also carrying `unreadMessages` for the dock and sidebar badge, so there is no separate unread poll),
  the sidebar cards every 3 minutes and only at lg width, `AutoRefresh` every 90 seconds (a full server render each time). Every timer skips a background tab. A new poller should join the shared status or follow the same rules.
- **Frequent scheduled jobs must be nearly free when idle** (2026-11-11; Netlify bills function time in credits, and `discord-class-channels` runs 43,200 times a month). It makes one quick check first (turned on, any call open, test call waiting, any class about to start, the last one through `needsCallWhere`, shared with the real run) and stops there when all say no: no owner lookup, no Discord request, no cleanup write. `runJob`'s `quietWhen` also remembers per server that a recent run row exists, so an idle run skips that read. Turning `discord.enabled` off, or pausing the job under System > Automatic tasks, still works and costs one read per run. A new job that runs every few minutes should have the same shape; `tests/db/discordIdle.test.ts` shows how to prove it.
- **Orange text** is `text-signal-fg`, never `text-signal` (that class no longer exists): it is a deeper burnt orange in the light theme and a lighter one in the dark theme, so it passes contrast in both. Backgrounds and borders stay `bg-signal` / `border-signal`, and a label on an orange fill is `text-signal-ink` (espresso, 5.0:1; cream or white on this orange is only 3.1:1, and globals.css turns a stray `text-white` / `text-slate-950` on `bg-signal` into the ink).

- **Pull to refresh** (`PullToRefreshMain`, touch screens only): the finger drives the page and the spinner through refs (no React state per touch move), on a rubber-band curve, with the
  browser's own bounce switched off while pulling (a non-passive `touchmove`). Twelve spokes light up as you pull and become the fading ring while it refreshes (the "iOS Spinner" idea from
  21st.dev, which has no pull-to-refresh component of its own). It refreshes the page's data in place (`router.refresh`) and tells the badges to look again. Always check a screen built for
  the computer at phone width too (390px and 320px) before calling it done.

## Rolling numbers, plan cards and "i" hints (added 2026-11-11)

- **Rolling numbers** (`RollingNumber`, `NumberTicker`): each digit is a CSS reel, a transition on `transform` (the compositor runs it), never a framer-motion spring per digit: a pricing grid holds a hundred digits and the Just me / Group flip changes most of them, and as springs it froze the switch. A reel owns a hidden "0" in normal flow that gives it its width, height and baseline; with only an absolutely positioned strip inside, the browser takes the BOTTOM of the box as the baseline and every digit rides too high. Clip with `clip-path`, not `overflow` (a box that clips with overflow takes its bottom edge as its baseline too). Every piece shares one line height and `align-items: baseline`. `text-decoration: line-through` does not paint through these boxes, so an old price uses the `strike` prop.
- **Plan cards** (`PaymentPlanTierGrid`): 3 Months and 6 Months carry their plan colour (tint, ring, pill and solid button, `COLORED_TERMS`, both Just me and Group looks); only 6 Months has the rising stars. The Just me / Group switch reads the picked value while the cards read a `useDeferredValue` copy, so the switch answers at once. In Settings (`narrow`) the plans are stacked, never a swipe carousel; only the public pricing page's phone view is a carousel. The colour fades are `--tier-fade` (320ms).
- **"i" hints** (`Hint`, `src/lib/hintPlacement.ts`, tested): the popup is a portal with fixed position, placed against the SCREEN (it slides, flips above or below and shrinks), so it can never leave the screen or be cut off by a card; it closes on scroll or resize. Never position a popup by hand with `left-0` or `right-0` next to an "i". **An "i" never carries a screen's own message (2026-11-12, the owner: "some i icons are really not supposed to be there").** An empty state, an error, a status, an instruction, a field's help, a page's description, a locked page's reason: those are content, so they are written on the screen in plain text or not at all. A consequence that costs money or cannot be undone (a ban, a credit spent, a bill date moved) is a short plain line beside the action. An explainer for a tool the owner built and uses every day is deleted. A sweep removed 91 of them; the ONE left is Atom's privacy notice, which is a legal disclosure kept in step with `PrivacyContent.tsx`. Do not add a new `<Hint>` without asking: if the words matter, show them. `EmptyState` renders its description as text. The Settings > Membership page has no "i" icons for the same reason.

## Pricing and personal discounts (added 2026-10-21)

- **Prices are the owner's numbers** (Admin > Pricing, owner only, `src/app/(dashboard)/admin/pricing/`): monthly plan price, 3 and 6 month discount %, family extra %, extra class price,
  fifth class price. They are settings (`pricing.*`, plus `payments.fifthClassPriceDollars`), read with `getPricingConfig()` (`src/lib/pricing.ts`). The math is still the pure
  `calculatePaymentPlanRate` / `calculateFamilyBundleTotal` in `classCreditPricing.ts`, which take a `PricingConfig` (default `DEFAULT_PRICING` = today's prices): never hard-code a price,
  pass the config. Server pages hand it to client components as a prop, or through `PricingProvider` / `usePricing()` in the signed-in layout. A plan keeps the price it enrolled at, so a
  price change affects new plans and plan changes only.
- **Personal discount** (`AccountDiscount`, one row per account, `src/lib/accountDiscounts.ts`): 1 to 90 percent off a SOLO plan. `discountedPlanPriceCents` (nearest dollar, a cent under). Setting,
  changing or removing it rewrites the account's running solo plan (`installmentAmountCents`, the one price bills read) and its unpaid, not-yet-submitted bill, and tells the student; the
  price before the discount is kept in `PaymentPlan.listAmountCents` so removing it restores the signed-up price exactly. New plans and term changes apply it (`createPaymentPlan`,
  `changePaymentPlanTerm`). Family plans keep the family rate and are left alone. All of it is audited (`pricing.update`, `pricing.discount.set/clear`).

- **Emailed links are for one person**: `tagAppLinks` tags every page link in an email (only `/api` and files are left alone, sign-in and reset steps included) and
  the middleware stops a different signed-in account on ANY tagged page, public ones like `/unsubscribe` too, with the "Sign in with the right account" screen
  (`/wrong-account`; a public target simply opens once they sign out). Any link the app builds from inside a page that is about another person (such as the
  unsubscribe confirmation's settings link) must carry their tag too (`settingsLinkFor`).

## Abuse guards (added 2026-10-12, `docs/ABUSE-AUDIT.md`)

One free trial per inbox forever (`trial-used:` marker, plus tags dropped at every domain); an unpaid first bill releases the weekly
time after `payments.firstBillLapseDays`; new lesson files get a random key. Read `docs/ABUSE-AUDIT.md` before changing money,
booking or access code: it lists what was checked and the business decisions left open.

## Sign-up and first-run friction (added 2026-11-12)

Fixes from a review of everything a new user hits between "Create account" and the first lesson. The shape to keep:

- **Sign-up page** (`(auth)/register/page.tsx` is a small SERVER page that reads `trial.enabled` / `trial.days` and renders the client `RegisterForm.tsx`; `force-dynamic`, and it opens without the line if settings cannot be read). The line under the title says when the trial starts and that a 6-digit code comes next, and never promises a trial that is switched off. The referral hint names plans the way the rest of the app does ("3 Month or 6 Month").
- **The captcha says when it cannot load** (`TurnstileWidget` reports a `CaptchaState` through `onState`: off / loading / ready / blocked; the script's `error`, a 12 second wait or the widget's `error-callback` mean blocked). Blocked shows plain words and "try again" under the widget, and the sign-up button is switched off; a tap before the token arrives says "one moment" instead of sending a request the server must refuse. `ClassRegistrationForm` gets the message too.
- **Going Back from "verify your email" keeps the form** (`src/lib/signupDraft.ts`, sessionStorage, name and email only, NEVER the password; cleared once the email is confirmed).
- **"Wrong email? Change it"** on the verify screen (`changeSignupEmailAction`): only for an account that has never been confirmed, proved by the password chosen at sign-up, checked server-side on every call; one error for a wrong password, an unknown address, a confirmed account and a banned one (no probing); rate limited per old address and per network; the old address's open codes are closed in the same transaction as the move.
- **Who keeps the password when an email is confirmed** (`src/lib/pendingSignup.ts`; fixed 2026-11-12, in two rounds, after a security review). Before, registering again over an unconfirmed address overwrote its password on the spot, so a stranger typing someone's address could set the password the real owner then confirmed; and a stranger who registered the address FIRST kept the password the owner later confirmed. The rule now: **a password survives the confirmation of an email only if the browser that set it proves it**; every other confirmation proves the inbox but FORGETS the password on file (replaced by a hash of a random secret, `unusablePasswordHash`; the person signs in with "Email me a code instead" or "Forgot?" and `verifyEmailAction` returns `passwordForgotten`, which the verify screen explains). How: every code issued for an EMAIL_VERIFY (register, first or again; log in to an unconfirmed account; Resend; change email) carries a payload `{ name, passwordHash, claimHash }`, and the browser that asked is handed the random `claim` whose hash that is (localStorage `bnp-signup-claim`, tied to ONE email, 24 hours, `signupDraft.ts`). `verifyEmailAction(email, code, claim)` applies the password whose claim the browser presents, looking in the code's own payload and in any earlier code for the same address in the last day (so a stranger's newer code does not cost the owner their password), and only while the account is still unconfirmed (`emailVerified: null` in the write itself). A register call writes nothing to an existing account, asks for the code first (so a code limit answers 429 and writes nothing; it used to be a bare 500) and answers in the same shape whether or not an unconfirmed account existed. **There is NO exception for a code without a readable payload** (an old code, or a payload made unreadable on purpose: a name over 200 characters once did exactly that and let the stranger's password survive): it forgets the password like any unproven confirmation. Names are capped at `MAX_PERSON_NAME_LENGTH` (120) where they are accepted and `pendingSignupPayload` clamps what it stores, so a payload always reads back. **Any new place that issues an EMAIL_VERIFY code must carry a payload and hand the browser a claim, or its confirmation will clear the password.** A code works only for the account still at the address it was sent to: `changeSignupEmailAction` closes EVERY open code for the account (any purpose, `userId` or old address), `resetPasswordAction` and the sign-in `authorize` step refuse an account that has left the code's address, and a banned account that never confirmed is not confirmed by a code (`verifyEmailAction` writes `emailVerified` only in its one conditional update). Tests: `tests/db/movedAccountCodes.test.ts`. Tests: `tests/db/signupClaim.test.ts`, `tests/db/signupFlow.test.ts`, `tests/pendingSignup.test.ts`, `tests/signupDraft.test.ts`.
- **The scholarship link follows the plan length**: "Have a scholarship code?" on the plan screen shows only while 6 Months is chosen (`showScholarshipClaim` in `planCheckout.ts`, which reads `SCHOLARSHIP_TERM`), never for 1 or 3 Months, and never for a group or parent plan. On a group or parent plan each PERSON has their own code button instead (see "Scholarships on group and parent plans" below).
- **Usernames**: the rules have no database in them and live in `src/lib/usernameRules.ts` (`usernameProblem`, `usernameCandidates`, `numberedVariants`); `social.ts` re-exports them. The first wizard step now refuses every name the last step refuses (reserved words are matched as SUBSTRINGS, so "badminton" and "atomic" are refused; that is the policy, not a bug). The wizard offers free names built from the student's name (`suggestUsernamesAction`, also after a refusal), and a username error on the last step sends them back to the first step where the field is.
- **Drums and Vocal stay switched off as an instrument** (see `INSTRUMENTS_COMING_SOON`: a clickable "coming soon" read as a bug). Instead the wizard has a separate "tell me when it opens" tick (`src/lib/instrumentInterest.ts`): a student who ticks one and picks nothing else is saved as Other, and an INTERESTED `Contact` (source `WAITLIST_SOURCE`) shows on Admin > People with the instrument beside the name (merged by email with their account, instrument only; the note is on the contact's own page under Added). No migration. Deleting the account removes only the entry this feature made.
- Tests: `tests/db/signupFlow.test.ts` (trial timing, the 429, the email change, usernames, the list), `tests/usernameRules.test.ts`, `tests/signupDraft.test.ts`, `tests/instrumentInterest.test.ts`.

## Passwords (added 2026-10-11)

New passwords need at least 8 characters and one special character (`src/lib/passwordRules.ts`); a number and mixed case only
make the strength bar fuller. The sign-up, reset and change-password screens show the 21st.dev "Password Strength" bar and
live checklist (`components/ui/password-strength.tsx`) from the same rules, and the register route, the reset action and the
change-password action enforce them on the server. Older passwords are never rejected at sign-in.

## Back buttons and the dock (added 2026-10-14)

Every page-level Back button is a `BackLink` (`components/ui/BackLink.tsx`): it goes to the page the person was actually just on
(`router.back()`), and uses its `href` only when there is no earlier page in the app (opened directly). `NavTracker` (in `providers.tsx`)
records the visited pages (`lib/navHistory.ts`). Never hard-code a Back destination with a plain `Link`. The bottom dock is always visible on
every device (the desktop proximity reveal is gone); the main scroll area keeps `pb-32` at every width so nothing is left under it (an
`md:py-10` once overrode the bottom padding and let the dock cover the end of long pages).

## Top bar by screen size (added 2026-10-10)

Under 768px (phones) the bar shows only the logo, the credit badge, Ask AI and the profile picture; every other button (Admin or
Live classes, notifications and mail, and for the owner student notes and class attendance) is listed in the profile menu
(`ProfileMenu` `appExtras`), with their counts on the picture. At 768px and up (tablets, computers) all buttons stay in the bar.
It is pure CSS (`hidden md:contents`), so it follows the window as it is resized. The hidden buttons stay mounted: the menu opens
their panels, and they report their counts, through window events (`topBarEvents.ts`).

## Account bans (added 2026-10-10)

`User.bannedAt` (+ private `bannedReason`) is set by `banUserAction` (`admin/users/[userId]/actions.ts`, the red "Ban" item at the end
of the Account card's "Manage" menu on the student page (moved there 2026-11-10 so the rarest action is no longer the loudest), with a confirm step; "Lift ban" reverses it; both audited as `user.ban` /
`user.unban`). Never for an admin or for yourself. A ban bumps `sessionVersion` (ends every open session) and
`getServerAuthSession` also refuses a banned account on its next request. Every sign-in route ends in the credentials
`authorize` in `auth.ts`, which throws `BANNED` for a banned account; `loginStepOneAction` says it after the right password
only (so it cannot reveal which emails are banned). The sign-in screens show `BANNED_MESSAGE` (`src/lib/ban.ts`) in red.
A ban is a termination (`banAccount` in `src/lib/accountBan.ts`, one transaction): it also cancels their active payment plans and every booked class (reason "Account banned", so no job re-books them), closes unpaid bills, ends complimentary access and the trial, clears and kicks their Discord link (best effort, after the transaction). Money paid is never touched, a payment waiting for review is left for the owner, and credits stay on the record. Lifting the ban does not undo any of it.

## Sessions can now be invalidated server-side

`User.sessionVersion` (a plain incrementing int) plus a check in the NextAuth
`jwt` callback (`src/lib/auth.ts`) is what makes "changing your password
signs out other devices" and the explicit "Sign out other devices" account
action (`signOutOtherDevicesAction`) actually work, every other open
session's JWT was stamped with the old version and fails on its next touch.
Don't reintroduce a separate ad-hoc "kill this session" mechanism; bump
`sessionVersion` instead.

## Security / review conventions actually followed in this repo's history

- A security review of the diff (this session used a dedicated
  general-purpose subagent prompted with the standard high-confidence /
  no-DOS / no-rate-limiting-findings ruleset) has been run before every
  push so far in this repo's Claude-authored history. Keep doing that for
  anything touching auth, money, or user data.
- Verification code flows (email/password change, 2FA, account deletion)
  all funnel through `src/lib/verification.ts`, one shared issue/verify
  function, rate-limited per (email, purpose), single-use, short expiry.
  Add a new `VerificationPurpose` enum value rather than inventing a
  parallel mechanism.
- Destructive/high-stakes admin and account actions get an explicit
  confirmation step in the UI (see the "Add confirmation steps for
  high-stakes admin actions" commit, and the Delete Account danger-zone
  pattern in `/account`), red button, explicit irreversibility copy,
  password + emailed code re-verified server-side on the final step
  regardless of what the client claims already happened.
- Touch targets: any button or link shorter than 36px gets the `tap` utility
  (`globals.css`), which enforces a 44px minimum on touch devices only, so
  desktop is unchanged. Links need `inline-flex items-center` for it to apply.
  Sits next to the 16px-input rule: both exist because the app is used mostly
  on phones. Check new screens at 390px.
- Phone card stacks: a group of cards that would otherwise be a long scroll on
  phones goes in `CardDeck` (`components/ui/CardDeck.tsx`), as on Home. Render
  each card via a function called once per place it appears: reusing one
  element that contains a streamed `<Suspense>` in two spots breaks hydration.
- No em dashes in copy or code comments written for this project (a
  standing, explicit brand rule from `PRODUCT.md`, this repo's own
  history includes a dedicated cleanup commit for stray ones).

## Liquid glass everywhere (added 2026-11-14)

Every card and every button uses the one glass material from the 21st.dev "Liquid Glass Login" component (source in
`reference/liquid-glass-login.tsx`; rules in `docs/glass-revamp/DESIGN-SYSTEM.md` Rule 1). New cards use `Card` or a
`glass-surface*` class; new buttons use the shared `<Button>`. Never hand-style a card or button with its own background,
border or shadow, and never add a second glass library. Kept solid on purpose: the `danger` button, the piano keyboard
and fretboard, the stageshow kit. The dock keeps its own look. The Solid surfaces setting, reduced transparency, forced
colors and reduced motion must always turn glass into solid surfaces.

## Log in is a page (added 2026-11-14)

There is no slide-over Log in panel. Every "Log in" link goes to `/login?callbackUrl=<current path>`. `/login` and
`/register` share the full-screen photo `public/auth/login-bg.jpg` under the glass card. Other auth pages keep the
plain background.

## Design system (added 2026-10-29, `DESIGN.md`)

**Hierarchy (2026-11-10, the owner: "everything looks similar and I can't focus on anything")**: `DESIGN.md` "Hierarchy" has the ten rules
(one focal point per card, three sizes and tones, value first with the label under it, status only when it is news, one primary button and
the rest in a More/Manage `ActionMenu`, destructive quiet, rows for lists, show a few and fold the rest). Build cards from
`src/components/ui/CardKit.tsx` (`CardHead`, `Facts`/`Fact`, `Meta`, `Callout`, `CardFoot`). `buttonVariants` now runs through `cn`, so a
caller's `className` (for example `text-red-300` on a ghost button) always beats the variant's own classes.

`DESIGN.md` at the repo root is the design system every screen follows: type scale (`text-caption` 12, `text-small` 13, `text-body` 16,
`text-title` 20, `text-headline` 24, `text-hero`, `text-figure`), corners (8 small, 12 controls and rows, 16 cards, 24 sheets, pills for
buttons), one orange accent. Tailwind's own size and radius names land on the same steps (`@theme` in `globals.css`), and `cn()` knows the
custom names. Use token classes (`text-slate-50/80`, `bg-signal/16`), never `text-[rgb(var(--c-s-50))]` or a px size. A control with its own
solid fill (`bg-signal`, `bg-amber-*`, `bg-red-*`, `bg-white`) is left out of the glass lens (`SOLID_FILL` in `GlassButtons.tsx` and the
matching CSS rule); add any new solid fill there too, or the lens paints over it.

**Font (2026-11-12, owner): smooth, rounded type everywhere.** Body copy, the signed-in app and the label (mono) voice are Nunito (`src/app/fonts/Nunito-Variable.woff2`, `--font-body` and `--font-mono` in `layout.tsx`); headlines stay Baloo 2. Sora and JetBrains Mono were removed. The OG image still draws with Sora (it loads its own font).

**Palette (2026-11-12, owner, replaces the Linen and Espresso one): pitch black, cream text, Burnt Orange.** The dark theme (id `ink`, the default) is a true black page `#000000`, warm near-black cards `#14110F`, cream text (`#FAF6EE` down the ramp) and the one accent Burnt Orange `#E8641E` (`--signal`; the label on an orange fill is dark ink, never cream). The light theme (id `paper`) is back to the old look: a gray page with white cards and near-black text. Semantic colours are plain green (`emerald`), yellow (`yellow`, new `--c-ye-*` tokens) and red (`red`, a true red, not crimson); orange is the accent only, never a state. Tokens live in `themes.css` and `globals.css` (`[data-mode]` and `[data-surface="app"]` blocks), mirrored in `marketing.css`; the launch images, manifest, offline pages, emails and `launchSplash.ts` use `#000000`.

## Card deck on computers (added 2026-10-30)

The phone card deck (cards stacking under a heading that stays put, `DeckStack.tsx`, `.deck-card` / `.deck-header` in globals.css) also runs
on a computer on the screens whose `WideLayout` has `deckDesktop` (Streak, Leaderboard). Home is no longer a deck (2026-10-30): one hero (`HomeHero`, the roadmap picture carrying today's step) and quiet rows with hairlines (`HomeRow` / `HomeRows`), colour only on the hero and the small icons. `docs/PREMIUM-AUDIT.md` ranks what is left. There each column is its own stack (cards
grouped by left edge), and the columns run the full height (`content-start`, no `items-start`) so a stack stays pinned to the end of the page.
Card grids (Roadmap's scales, the admin overview) keep normal scrolling on a computer.

## Releases (added 2026-11-11, `docs/RELEASES.md`)

Netlify bills 15 credits per production deploy, and merging 50 times in nine days used three quarters of a month's 1,000 credits ($9 plan, $5 per top-up). So production deploys from the **`release` branch**, not `main`: the
`Release to production` workflow (`.github/workflows/release.yml`, `scripts/release-to-production.sh`, tested in `tests/releaseScript.test.ts`) fast-forwards `release` to `main` once a day at 08:17 UTC, only to a commit whose CI passed,
and does nothing when nothing is new. The owner ships something at once from Actions > Release to production > Run workflow. Pull requests keep their free Netlify preview. A migration reaches the live database when the release builds, not when
the PR merges. Never push to `release` by hand and never force it; the script refuses a `release` that holds anything `main` lacks. The one-time Netlify settings (Production branch `release`, Branch deploys only for `staging`, Deploy Previews for all pull
requests) are in the doc: until they are set, Netlify still deploys `main` and the workflow is harmless.

**Netlify builds need a bigger Node heap (2026-11-12).** Every production build from #413 to #420 failed on Netlify with "JavaScript heap out of memory" (Node exit 134, which Netlify prints as "non-zero exit code: 2") while CI, whose machine has more memory, passed, so the live site stayed on #414 for a day. `netlify.toml` now sets `NODE_OPTIONS = "--max-old-space-size=4096"` under `[build.environment]`. A failed Netlify build with exit code 2 is not proof the code is wrong: open the deploy log first. As of this date Netlify's Production branch was still `main` (each merge deployed at once; the `release` branch existed but nothing built from it); update this line when that setting is switched.

## Workflow this session (and prior Claude sessions in this repo) actually follow

1. Branch per unit of work, PR against `main`, `subscribe_pr_activity`,
   watch CI (Netlify's own deploy-preview check is typically the only
   status check), merge (squash) once green and mergeable. **Merging does
   not put it live** (see "Releases" below): never tell the owner it is
   live just because it merged.
2. If the assigned branch's PR was already merged, **restart it from the
   latest `main`** (`git fetch origin main && git checkout -B <branch>
   origin/main`) and cherry-pick only the genuinely new commits forward,
   never stack new work on top of already-squash-merged history, since
   that reintroduces the whole old diff against the now-different `main`.
3. Full verification before every push: `tsc --noEmit`, `next lint`,
   `next build`, plus the Postgres-backed migration/runtime check above for
   anything schema-touching, plus a security-review pass.
4. A LOT of independent work has landed on `main` outside any session this
   context remembers (mobile/accessibility fixes, a full homepage redesign,
   Discord + fretboard + Shop-page additions, admin self-service schedule
   management, the GlitchTip switch, family booking, session-versioning...).
   **Don't assume the state you last touched is still current**, `git log
   origin/main` and a targeted `git show origin/main:<path>` for anything
   load-bearing before making a change, the same way this file was written.

## Retired database models

`Account`, `Session` and `VerificationToken` (the NextAuth adapter tables, unused:
sessions are JWT), `LoginEvent` and `LessonBooking` (historical) are not read or
written by any code. They stay in the schema on purpose: dropping a table is
irreversible, so do it only in its own migration, after confirming with the owner
that nothing in production needs the rows.

## Pausing a plan (added 2026-10-21)

Settings > "Pause your plan" (`PausePlanCard`, `pausePaymentPlan` in `paymentPlans.ts`, pure rules in `planPause.ts`): a running, paid-up, non-family plan can pause 1 to 4
weeks, once per 90 days (`PaymentPlan.pausedAt` / `pauseUntil` keep the last one). The weekly slot stays reserved. In one transaction the next due date and the expiry of the
plan's unused `CreditGrant`s move out by the same whole weeks (the one place a grant's `expiresAt` is ever changed; its "expiring soon" flag resets), and classes inside the pause
are canceled with `canceledReason = "Plan paused"`, which `createReservedBookingIfAbsent` already reads as "do not book again", so both booking jobs skip them with no extra code.
Refused while a payment is under review or the bill is already due. The student and the owner are told, and `plan.pause` is audited.

**The studio can pause a plan too** (2026-10-25, `adminPausePlan` / `adminResumePlan`, buttons next to the Active badge in Admin > Billing > Plans and in the plan box on the student page): to a date up to a year out, or **indefinitely**. Same mechanics as the student pause (weekly time kept, next bill and credit expiry moved out by the span, classes inside it canceled with "Plan paused", an unpaid bill for the old date expired); an indefinite pause uses a fixed 10 year span (`INDEFINITE_PAUSE_MS`, no schema change: `pauseUntil` is 10 years after `pausedAt`, read with `isIndefinitePause`), and resuming moves both back by the time actually paused. `bookReservedWindowForPlan` books nothing while a plan is paused (`isPausedNow`), a student cannot pause on top of it, and students see "paused until the studio resumes it" instead of the far date. Not for family plans.

## Parent mode (added 2026-10-26)

Settings > Parent mode (`ParentLinksPanel`, `/parent`, `lib/parentLinks.ts`, table `ParentLink`): a parent adds a child's OWN account by email (the same account-exists check as group plans, `checkFamilyMember`), the child accepts once (bell notice `PARENT_LINK_REQUEST`, answered in the child's Settings), and either side can end it any time. `assertParentOf` is the gate every parent action goes through; a non-linked parent gets a 404 on `/parent/[childId]`. A linked parent sees the child's progress, practice and classes (`getChildView`), can book, move and cancel their classes and move their weekly time acting AS the child (same cutoffs and credit rules, the child is told; `parent/actions.ts`), and pays for their plan.

Paying (`createParentPlans`, `enrollParentPlanAction`, "Parent mode" button in the people area of the plan form, or `/billing/plans?who=parent`): a `FamilyPlanGroup` with `kind = PARENT`. Each linked child gets their own plan; ONE combined `FAMILY_PLAN_START` payment from the parent starts them all; later 28-day bills are the parent's (`listParentBills`, shown on `/parent`, the payer-may-submit rule is unchanged). The parent is never forced onto a plan: "I'm learning too" adds a plan for them at the same price, off by default needs no plan of their own, and leaving their own plan never ends the children's (`afterFamilyPlanEnded` only ends a FAMILY group when its payer leaves). Abuse guards (`tests/db/parentAbuse.test.ts`): link lookups are rate limited BEFORE they answer (the answers differ, so unlimited tries would list accounts), a pair is limited to 3 asks an hour, a child who ends a link is remembered like a decline (30 days), and a plan a parent pays for can only be ended by the parent (`parentEndChildPlanAction`), never by the child. One person pays the solo price, two or more the group rate (`parentPlanPerPersonCents`, `checkoutTotals({ parent })`). **Every person on it has their own weekly time** (decided 2026-10-29): each child, and the parent when learning too, picks one on the plan form (`parentTimeHolders`, one picker per person, times another person picked are hidden), `createParentPlans` takes `children: { email, scheduleId, chunkIndex }[]` plus `selfSlot`, refuses two people on one time (`duplicateWeeklyTime`) and checks each time with `assertSlotReservable` inside the transaction; the combined first payment books every plan's weekly class. The plan screen is two columns from md (plan and people beside the times) and ends with the price and Review (`CheckoutBar` is a plain card now, not pinned). **A linked child cannot change their own schedule**: while a parent link is accepted (`hasParentControl`), the child's own booking, cancel, reschedule and weekly-time actions in `lessons/actions.ts` refuse with "Your schedule is controlled by your parent.", and /lessons shows that line over a switched-off screen (`ParentLockedArea`); only the parent (through `/parent`) can change it. `changeReservedSlot` blocks only FAMILY groups, so the parent's move works. No one-group-per-payer limit and no change cooldown for PARENT groups.

**A child account is managed by its parent (2026-11-12, the owner).** "Child account" means an accepted `ParentLink` (`hasParentControl`). Beyond the schedule and payment lock above: the child cannot end the link (`endParentLink` refuses once accepted; only the parent, or an admin, can; a child may still turn down a request that is only waiting), cannot change their email or password or delete the account (`childAccountBlock` in `checkEmailChange`, `checkPasswordChange`, `verifyCurrentPassword`; Settings shows "Your parent manages this"), and every friendship with a child waits for a linked parent: when both sides say yes, `acceptFriendRequestById` sets `PARENT_REVIEW` instead of `ACCEPTED` and makes one `FriendParentApproval` row per child on it (both parents when both are children), the parent gets `FRIEND_PARENT_REVIEW` and approves or declines on `/parent/<child>` (`ChildFriends`, `friendParentReview.ts`); the friendship starts (`finalizeFriendship`) only when every row is approved. A parent can also remove any of the child's friends there. The leaderboard already leaves linked children out; Atom stays. Tests: `tests/db/kidAccount.test.ts`.

The old "family plan" is now called **Group plan** everywhere a person reads it (form tab "Me and others", Terms "Group plans", notices); code names (`FamilyPlanGroup`, `family*` files, the `#family-plans` anchor) are unchanged. "Family" still means a class session for several students (`bookFamilyClass`), which is a different feature.

## Interface polish (added 2026-10-26)

- **Shortcuts** (`lib/shortcuts.ts`, handled in `CommandMenu`): Cmd/Ctrl-K or `/` opens the command menu, `?` the shortcut sheet, `B` the sidebar, and "G then a letter" jumps (G H home, G M messages, admin G A / G Y / G C). Hints are `Kbd` keycaps (hidden on touch): in the menu rows, on sidebar hover, in the help sheet. A new destination with a shortcut goes in `GO_SHORTCUTS`, nowhere else.
- **Once-only requests** (`lib/idempotency.ts`, table `IdempotencyKey`, client `newIdempotencyKey()`): wrap a money or booking action in `runOnce(userId, scope, key, work, { isSuccess, whileRunning })`. The page makes one key per attempt and renews it after success; a double tap or retry gets the stored answer, a failure frees the key. Used by starting a solo or family plan and booking a family class. The daily `credit-expiry` job purges keys older than a week.
- **Motion**: `withViewTransition` (`lib/viewTransition.ts`) crossfades the page when a dock tap swaps in the skeleton and again when the real page arrives (`NavPendingGate`); keep the callback synchronous (flushSync). Dialog is a bottom sheet you can pull down by its handle or title on phones. The dock icon pop is a spring so a second tap takes over. `SwipeBack` (installed app only) drags the page in from the left edge to go back. **Keyboard actions never animate** (2026-10-30): every shortcut (and Escape) calls `markKeyboardAction()` (`lib/keyboardMotion.ts`), which sets `html[data-kb-motion="off"]` until the next pointer press or 2.5s; globals.css drops the command menu's, the page arrival's and the sidebar's motion while it is set. Gate any new animation a shortcut can trigger the same way. The page arrival is a 200ms fade and 6px rise with no overshoot, because it plays on every navigation.
- **Admin menu flyouts** use the safe triangle (`lib/safeTriangle.ts`): crossing another row on the way to an open flyout does not swap it. Reuse `isHeadingForFlyout` for any hover submenu.
- **Images**: `BlurhashImage` draws a BlurHash (made by `node scripts/make-blur-placeholders.mjs` into `blurPlaceholders.generated.ts`; rerun after adding a photo under public/marketing, shop or screenshots) until the photo loads. `useSwr` (`lib/useSwr.ts`) shows the last fetched copy at once and refreshes behind it. Chrome prerenders main-navigation links (`a[data-prerender]`) through `/speculation-rules.json`, sent as a `Speculation-Rules` header so the CSP needs no change; never mark a page whose opening changes data (Messages, a mail message).
- **Type and touch**: headings are balanced, paragraphs `pretty`, the signed-in shell uses tabular numbers, and EVERY rounded box uses `corner-shape: squircle` where supported (a universal rule in globals.css base layer; circles and pills, `rounded-full`, stay `round` because a squircle would square a circle; a rule that sets its own corner-shape, like the dock, wins). `hit-slop` extends a small control's touch target by 8px; `viewportFit: "cover"` plus `pad-safe-x` keep the shell clear of the notch. The emailed and texted code boxes already use `autocomplete="one-time-code"`; the SMS ones also read the code with WebOTP (`useWebOtp`).
- **Scrolling** (2026-10-30): the page and `#app-scroll` hide their scrollbars; a thin orange `.scroll-progress` line at the top shows how far down you are (scroll-driven CSS, no script). On phones and tablets, cards tagged `deck-card` (Home, Roadmap) form a deck (the admin overview does NOT: under its greeting it scrolls as a plain list, decided 2026-10-30): each sticks under the top bar and the next is drawn over it, earlier cards' tips showing (up to 5); `DeckStack.tsx` sets each card's stopping place (tall cards stop once their bottom is seen). A page heading marked `data-deck-header` (class `deck-header`) stays put above the deck (Home, Roadmap, Streak, Leaderboard, admin overview). Tag a new screen's heading and top-level cards the same way. Menus that open over page text use `glass-menu` (mostly solid matte glass), not `glass-surface-elevated`.
- Toasts: `toast.undo(title, onUndo)` and `toast.run(promise, { loading, success, error })` in `ui/Toaster.tsx`.

**Moving the next bill (2026-10-31)**: "Bill date" on the student page's Scheduler tab (owner only, any running plan that is not paused, group and parent plans included) moves the next bill to a day from today to a year out (`changePlanBillDate`, rules in `billDateRules.ts`, tested). Only `nextDueDate` changes, by whole days so the bill keeps its time of day; credits, classes and the weekly time stay. An unpaid bill already sent for the old date is expired so the new date gets a fresh one. The student is told when Notify is on; audited as `plan.bill-date`. Made for fixing a date that went wrong; a paused plan is moved back with Resume instead.

**Moving a whole plan (2026-10-25)**: "Move time" next to Pause (Admin > Billing > Plans and the student page) opens the free weekly times and calls `changeReservedSlot(..., { byAdmin: true })`: the standing slot and every upcoming class on it move together (the old weeks are canceled with no charge and rebooked on the new day inside the paid period), with no 24 hour cutoff and family payers allowed. The student is told; audited as `plan.move-time`. The one-class mover on the attendance list is unchanged.

## Owner reservations (added 2026-10-25)

Admin > Classes > Schedule > Reserved (`AdminReservations`, `ownerReservationsAdmin.ts`, table `OwnerReservation`): the owner keeps a day (every window, `chunkIndex` null) or chosen hours for a named customer (name, email and phone required). Unlike a `SlotHold` (a reminder that never blocks), this BLOCKS: `bookClass`, `adminBookClass`, `bookFamilyClass`, `rescheduleClassBooking` and `bookExtraSessionOccurrence` refuse it ("reserved by the owner"), a plan's weekly auto-booking skips that week (`createReservedBookingIfAbsent`), and `getUpcomingOccurrences` marks it `isBooked` (+ `reservedByOwner`), so students just see the time as taken and never see the customer. Creating one is refused when someone already has a class in it. Release (two taps) frees it. Audited as `reservation.create` / `reservation.release`.


## Seats per slot (added 2026-11-10)

`ClassSchedule.seats` (default 1, whole number 1 to 1000, set in the Times form as "Seats per slot") is how many students share each hour-long class of a window; a weekly PLAN counts too, so up to `seats` live plans can keep the same weekly time. One rule everywhere (`src/lib/seatRules.ts` pure, `seatLoad.ts` queries): the seats used by an occurrence are the SCHEDULED `ClassBooking` rows at that exact (schedule, date, instant), one per student, plus live plan holders for that week who have no class there yet (`planHoldsOccurrence`); it is full when that reaches `seats`. A weekly plan group that shares one class (`familyGroupId`) is ONE seat. An ad hoc family class takes a seat each but never more than the slot has (`seatsNeededByParty`), so it still fits an empty one-seat slot as before. With 1 seat every old rule and message is unchanged. Sites: `getUpcomingOccurrences` (adds `seats` and `seatsLeft`; `isBooked` means full; students see "N left" only when 3 or fewer remain, `seatsLeftNote`), `bookClass`, `bookFamilyClass`, `rescheduleClassBooking`, `createReservedBookingIfAbsent`, `bookExtraSessionOccurrence`, `bookingRequests.ts`, `assertSlotReservable` and `changeReservedSlot` (`countLivePlanHolders`, `findFullInstant`), `getReservableSlots` (a time is offered while plan holders < seats), `weeklyTimeOptions.ts` (a class is a clash only on a week that is full), `weeklyWindowMove.ts`, restart canceled plan. Custom one-off times (`adminBookClassAtTime`, `oneOffOverlap`, `assertCustomTimeFree`) stay single occupancy on their own 1-seat hidden schedules, and an overlap with another window's class is still refused. Lowering `seats` below the most people on any upcoming hour (or plans keeping a time) is refused naming that hour (`assertSeatsStillHoldEveryone`). A new check that asks "is this time taken" must use `loadSeatLoad` / `countSeatUnits`, never a lone `findFirst` on `ClassBooking`. Tests: `tests/db/classSeats.test.ts`, `tests/seatRules.test.ts`.

## Staging and smoke checks (added 2026-10-27, `docs/STAGING.md`)

`APP_ENV=staging` (+ `NEXT_PUBLIC_APP_ENV=staging`) makes a deploy the safe testing copy (`lib/appEnv.ts`): a STAGING tag, `noindex`, no email to anyone outside the test allow-list (`stagingMayEmail`, guard in `sendEmail`), and the staging-only `/api/staging/open-test-payment` (404 elsewhere, needs `STAGING_SMOKE_TOKEN`). `scripts/seed-staging.mjs` (refuses without `I_AM_SEEDING_STAGING=yes`) makes the test accounts. `npm run smoke` (`scripts/smoke/`) runs five checks against `SMOKE_BASE_URL`: site and security, sign in and roles, classes and schedule, parent mode, payments pipeline (signed test bank emails through `scripts/send-test-bank-email.mjs`). `.github/workflows/staging-smoke.yml` runs them nightly and does nothing until the `SMOKE_BASE_URL` secret exists. A new feature that changes sign in, booking, parent mode or the payment email path should get a step in the matching check.

## Catching a broken change before CI (added 2026-10-27)

A file that starts with `"use server"` may only export async functions and types; a constant or class there fails `next build` but not `tsc` or lint, so it once reached CI and emailed the owner. `tests/useServerExports.test.ts` reads every such file under `src` (part of `npm test`, so CI too). `.githooks/pre-push` runs the type check, lint and all tests before every push; turn it on once per checkout with `npm run hooks:on` (`git push --no-verify` skips it). Still run `npm run build` before opening a PR that touches routes or actions.

## Payment receipts (added 2026-10-31)

Approving a payment (`approveZellePayment`) keeps the bell notice but sends a real receipt instead of the old plain "Payment approved" email
(`sendPaymentReceipt` in `src/lib/paymentReceipt.ts`, wording in `paymentReceiptRules.ts`, tested; email in `renderPaymentReceiptEmail`): the
BNP code as the receipt number, amount, date, payer (a bank's all-capitals name is title-cased), method, account, what it was for, the 28 days
it covers, classes added and the next bill. It goes out whatever the payments switch says (a payment result is the documented exception) and
never to a banned account. The same receipt is a printable page at `/billing/receipt/[paymentId]` (the payer or an admin; anyone else gets a 404),
linked from Payment history; only a VERIFIED payment has one. Admins reach every receipt from Billing > Payments and the student page's Money tab, and the owner is emailed
a "Receipt copy" of each one while the owner-only `RECEIPT_COPY` alert is on (Admin > People > Staff; never for the owner's own payment).

## Data page (added 2026-10-31)

Admin > Setup > Data (`/admin/data`, owner only, read only; `src/lib/adminData.ts`): four views in `?tab=`. Scales: a checklist funnel per scale (open, module read,
practice done, finished), stuck 21+ days, first-try quiz pass, average quiz, median days to finish, lessons finished, and a student by scale grid. People: every
student's figures in four column groups (account, learning, classes and money, help), cards on phones. Collected: every kind of record kept, with live counts.
Insights: fixed checks over the studio's own numbers (`buildInsights` in `adminInsightsRules.ts`, pure and tested), each a finding with its numbers and one thing to
try; nothing is sent to Gemini or anywhere else, and a check needs `MIN_SAMPLE` (3) people before it speaks. Add a new check there with a test.

## Admin navigation pattern (added 2026-11-05, `docs/ADMIN-PATTERN.md`)

Two levels at most: six sections, each showing its everyday pages as tabs and the rest under a **More** tab (`more: true` in `adminNav.ts`, `splitHubPages`). A person's page is one scroll of six collapsible sections with a sticky index (no tabs hiding content), a single top row (Message, Add credits, Book a class, one Notify switch) and one **Plan** menu (`ActionMenu`) whose rare owner tools sit under "Advanced". Cmd-K does jobs for a person (`?do=` links, `commandRecents.ts`), the Overview opens with **Needs you** (`needsYou.ts`), and a tap on an Accounts row opens a side summary on computers (`PersonPeekPanel`). A job appears once per screen; never add a third row of tabs.

## Admin Overview (reworked 2026-10-30)

`/admin` has no greeting or date, and no admin page shows a title (2026-10-31): the phone section bar and the section tabs pin together at the top (`deck-header` in `admin/layout.tsx`) and the content starts right under them; each page keeps a screen-reader `h1 className="sr-only"`. It shows only what the owner asked for: the schedule (today in the hero, a 7-day strip from `getWeekSchedule`, today's classes), the money (this week and this month with week and month bars from `getRevenueSummary` / pure `summariseRevenue` in `revenueSummary.ts`, tested; every 28 days; due in 7 days; all-time) and a rough "How it's going" (plans, full access, progress by scale folded away). Automatic tasks (`#tasks`) and page views live on Setup > Security; follow-ups behind the Follow up button; payments to approve on Billing > Payments. Put new operational panels on the page they belong to, not here.

## Activity log (added 2026-10-21)

Admin > Overview > Activity (`/admin/activity`, owner only) is a searchable view of `AuditLog`: text search over action, details and actor email, a kind filter
(the part of the action before the dot), a date range (30 days by default) and `?user=<id>` for one account's changes. 50 per page. Plain-English action names
live in `src/lib/auditView.ts`; an action not listed there shows as its code, so add a label when you add a new audited action. The student page's change log links to it.

## Personal calendar feed (added 2026-10-21)

Settings > "Your classes in your calendar" gives a signed-in student a subscribe link (`webcal://` and https) to `/api/calendar/me?u=<id>&t=<token>`: their SCHEDULED classes for the next
120 days with a 15 minute alert and the Discord link; a canceled class is simply absent so calendar apps drop it on refresh. Calendar apps cannot sign in, so the token is an HMAC of
the account id and `User.calendarVersion` (`studentCalendar.ts`, nothing stored); "Make a new link" bumps the version (`POST /api/me/calendar`, audited as `calendar.reset`) and the old
link 404s, as does a banned account's. The teacher's own feed (`teacherCalendar.ts`) is separate and unchanged.

## Push reminders (added 2026-10-21)

Settings > "Reminders on your phone" (`PushCard` in `AccountSettings.tsx`, `public/sw.js`, `/api/me/push`, `webPush.ts`, `pushRules.ts`): class and practice reminders also arrive as web push. `createNotification` pushes
only when its `emailCategory` is `reminders` or `classes` and the person's own switch for it is on (same rule as the email; a banned account gets nothing). `PushSubscription` rows are one per
browser; the push service saying 404/410 deletes the row. The endpoint a browser sends must be on an allow-list of real push hosts (`isAllowedPushEndpoint`), because our server POSTs to it.
**Needs three env vars to turn on**: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (make a pair with `npx web-push generate-vapid-keys`) and optionally `VAPID_SUBJECT` (`mailto:...`). Without the keys the card is
hidden and nothing is sent. On iPhone/iPad push only works once the site is on the Home Screen, so the card shows those steps first (the "Add to Home Screen" prompt).

## Offline (added 2026-10-31)

`OfflineNotice` (providers.tsx) shows a red "No internet connection" pill while the device is offline (the top banners step aside) and a short "Back online". `public/sw.js` is now installed on every visit (`ServiceWorkerSetup`, production only) and, besides push, serves the self-contained `public/offline.html` when a page is opened with no internet; it caches only that page and `/logo-mark.png` (`bnp-offline-v1`, bump the name when the page changes). Never add other caching there without a plan for stale pages.

## Referrals (added 2026-10-21)

Settings > "Invite a friend": each account has a `referralCode` (made on first view, `referrals.ts`); `/register?ref=CODE` carries it into sign-up, which records a `Referral` (own, unknown or banned-referrer codes are ignored; one referral per invited person).
When the invited person's FIRST plan payment is approved (`approveZellePayment`, installment 1) and their plan is a 3 or 6 month term (`isQualifyingReferralTerm`; Monthly earns nothing), `rewardReferralForFirstPayment`
claims the reward once (atomic `rewardedAt`) and gives BOTH people a 10% `AccountDiscount` for 3 months (`referralRules.ts`). The discount rides the personal-discount tool: `expiresAt` marks one that ends by itself, the owner's own
discounts have none, and setting a discount by hand clears any expiry. A reward never lowers a bigger or longer discount (`rewardWouldHelp`). The daily `credit-expiry` job runs `expireTimedDiscounts`, which deletes due discounts and
puts the running plan back to its list price. Audited as `referral.reward`.

## Teaching day screen (added 2026-10-21)

Admin > Teaching > Today (`/admin/today`, `src/lib/teachingToday.ts`): today's classes (Eastern day) grouped by start time, one row per student with the facts a teacher wants before class: first class flag, in person flag,
plan, current open scale, days practiced out of 7, credits left, Discord linked, overdue bill, and the newest teacher note. Read only; the sidebar "Today" card for admins opens it. Marking attendance stays on Schedule > Attendance.

## Payment plan screen (reworked 2026-10-24)

`/billing/plans` for a new plan is `NewPlanForm` (`billing/plans/`): Just me / Me and my family, plan length, family emails, then the weekday-and-time chips. `?term=TERM_3&who=family` (set by the pricing page's Start plan links, kept through the login redirect)
preselects everything but the time. The price and the next step live in `CheckoutBar` (fixed above the dock on phones, sticky from lg), and the family price follows every added row (`checkoutTotals`, `planCheckout.ts`, pure and tested). Each typed family email is looked up live
(`checkFamilyMemberAction` -> `familyMemberCheck.ts`, 40 a minute per account because each answer says whether an email has an account): a square loader, then a green check, or why not (no account, needs a first and last name, cannot join, your own, a repeat).
Review stays off until every row is a found account. The server still re-checks everything in `createFamilyPlans`.

## Weekly time waitlist (added 2026-10-21)

On Billing > Plans the weekly time picker (`WeekdayTimePicker`) shows the times other plans hold dimmed, right in the day and time chips (`getTakenSlots`, the chunks `getReservableSlots` does not return); tapping one offers "Tell me when it opens" / "Stop waiting"
(square loader while it saves), for up to 5 times (`SlotWaitlist`, `slotWaitlist.ts`). Joining a time also sends the OWNER only a notice, once per new entry: "<name> is looking forward to <Day>s at <time> becoming available.". The hourly `slot-waitlist` job (`netlify/functions/slot-waitlist.ts`, in `JOB_MAX_SILENCE_HOURS`) runs `notifyOpenedSlots`: for each waitlisted time that is open again it tells ONLY the first person in line
(`SLOT_WAITLIST_OPENED`, class-updates switch, so it also pushes), then waits 24 hours before offering it to the next; a time that is taken again resets the offer; entries older than 90 days, for a retired schedule, or for someone who now holds
that very time are cleared. Nothing is reserved for the person told: the time still goes to whoever starts a plan first.

## Tests that guard money and access (added 2026-10-21)

`tests/db/` now also covers `access.ts` (`accessGate`), `scaleApproval.ts`, `creditLedger.ts`, `creditAdjustments.ts` and `attendanceAutoCharge.ts`: who can open which scale, the teacher-approved drip and its two rules, FIFO draw-down and the
once-only expiry (floored at the real balance, never touching credits a booked class holds), admin credit changes that can never go below zero, and the unmarked-class charge happening once. Settings in tests go through
`saveSetting` / `resetSetting` (the raw table is cached for 10 seconds).

Icons: import every icon from `@/components/ui/appIcons` (never from an icon package directly). It maps the names the screens use to
Phosphor's duotone icons (soft, rounded, with a tinted fill; chosen by the owner 2026-10-30, replacing lucide), drawn solid when given a
`fill`; change the whole look there. Hand-drawn brand marks (Discord and the like) stay in `@/components/ui/icons`. Do not add another icon library.

Complimentary access (the `hasCurriculumAccess` flag) is visible and traceable: Admin > Accounts has a "Complimentary" tab and a badge on each such row, and every grant or removal is in the activity log (`access.grant` / `access.revoke`,
naming the account), including the rare old curriculum payment that is approved late (`approveZellePayment`).

## Add to Home Screen (added 2026-10-22)

`AddToHomePrompt` (mounted in `(dashboard)/layout.tsx`, `src/components/pwa/`) asks once per DEVICE (localStorage `bnp-add-to-home-seen`, not per account) to put the site on the Home Screen, with the numbered steps for iPhone/iPad and Android
(`HOME_SCREEN_STEPS` in `src/lib/addToHome.ts`; Chrome on Android also gets a one-tap Install button from `beforeinstallprompt`). Phones and tablets only, never when already running standalone, never over the first-visit tour or the "what's new"
card (it waits for a later visit), and only while the tab is visible. "Maybe later" or the X shows a short note pointing to Settings > Tutorials, where the same steps live permanently ("Add to your Home Screen" card).

The dock (`AppDock`) is also alive: it sits a little higher (clear of the iPhone home bar), the sliding highlight capsule and the tapped icon overshoot on a spring so they wobble, and it tucks into a smaller pill (about 82%) while the page (`<main>`) scrolls
down and opens again on scrolling up or at the top. Reduced-motion users get none of the springs. **It is an exact copy of Instagram's floating tab bar (rebuilt 2026-10-31 from the owner's screenshots, after the GlassLens version drew as a square
grey bar):** a 58pt pill 22pt from the screen edges, a dark smoky tint over a heavy CSS frost with a glass rim brightest along the top (`.ig-dock` and
its `::before` in globals.css; a smoky espresso tint with cream icons on Ink, milky cream with espresso icons on Paper), five slots 10pt in from the ends, an 82 by 50pt light capsule behind the
current tab that slides, bold 26px coolicons (`coolicons.ts`, copied exactly from coolicons by Kryston Schwarze, CC BY 4.0, through `@iconify-json/ci`; chosen by the owner 2026-10-31, never redrawn by hand; filled on the current tab where the drawing is a closed shape, a bolder line for the map and calendar), and a small red unread dot at the icon's lower right. No GlassLens. Scrolling
down shrinks the whole pill in both directions (a scale anchored at its bottom). The owner's dock has Admin (a shield) in Messages' place. Keep this look unless the owner asks.

down and opens again on scrolling up or at the top. Reduced-motion users get none of the springs. Its colors come from the theme ramp (`--c-s-*`), so it is a frosted cream pill with espresso icons on Paper and a smoky espresso glass pill with cream icons on Ink; never hard-code dock colors.

## Notify student switch and Reschedule (added 2026-10-31)

Every studio action that changes something for a student takes a final `notify` argument and runs inside `withStudentNotice(notify, ...)`
(`src/lib/notifyScope.ts`, AsyncLocalStorage). With it off, `createNotification` and `sendEmail` skip anyone who is not an admin (the email is
logged as SKIPPED, "The studio chose not to notify the student"), so the change happens but no bell, Mail, email or push reaches the student;
the owner's own alerts and copies still arrive. The screens show `NotifyToggle` (`useNotifyStudent(place)`, off by default, remembered per
place on the device; `payments` and `applicants` default on). A list of quick buttons gets one switch at the top (`NotifyPlaceToggle`), and the
student page, the Plans list, Pause and the plan builder share the `student-changes` place. A new admin action that can reach a student must
take `notify` and show the switch. Tested in `tests/db/notifyScope.test.ts`.

Reschedule (the arrows on a student's class, `StudentScheduler`) replaced Move: any class not yet marked Present or No-show, past ones too, moves to
any time, past ones too (`rescheduleClassBooking(..., { byAdmin: true, anyTime: true })`; the calendar's `allowPast` opens the last 180 days). A class
booked on the wrong day is put on the right one and marked there, with no refund and re-charge; a marked class must be undone first. A move into the
past never tells the student.

## Switches (added 2026-10-31)

Every on/off switch uses one look (`components/ui/switch.tsx`, the owner's request): off is a visible track (a tint of the theme's text color)
with a small orange dot on the left; on is a full orange track with the dot grown into a white knob flipped right. Use `<Switch>`; a hand-built
`role="switch"` button (one that carries its own label) draws `<SwitchLook on={...} />` inside it. Never style a switch some other way. The
dark/light toggle in Appearance (`LiquidThemeToggle`) is a different control (a mode picker, not on/off) and keeps its own look.

## Studio tools on the student page (added 2026-10-31)

Each person on a group or parent plan has their own plan, so the studio manages it on its own: the plan builder, studio pause and late
settling accept a group member's plan once the group's combined first payment is approved (`assertGroupPlanStarted` in `planBuilder.ts`).
**Weekly time** (`AdminWeeklyTimeButton`, `adminWeeklyTime.ts`, any admin) moves one plan's standing time and every upcoming class on it
(`changeReservedSlot(..., { byAdmin: true })`). Owner only: **Plan settings** (`AdminPlanSettingsButton`, `adminPlanTools.ts`: length,
exact price per bill (refused while a personal discount sets it), next 28 days free as a $0 VERIFIED "Waived by the studio" installment
through `applyPlanInstallment`), **Restart canceled plan**, and in the Account card **Edit details** / **Send reset code** / **Free trial**
plus **Credit expiry** in the Class credits card (`adminAccountTools.ts`). Any admin: **Cancel all upcoming** (one notice) and Schedule >
Reserved > **Close a day** (`adminClassTools.ts`: cancels the day's classes and keeps the day as a "Studio closed" owner reservation, released
there to reopen). All take the Notify switch except the reset code, which always goes. Elements a server page passes into a client
component's slot prop need a `key`, or React warns in development.

Owner only, in `adminGroupTools.ts`: **Group** (Scheduler tab, `AdminGroupButton`) lists who is on a group or parent plan and who pays,
moves one person onto their own plan (`separateFromGroup`: same time, term and credits, solo price with their discount from the next bill,
their unpaid group bill closed; a group payer must hand over first) and changes the payer (`changeGroupPayer`: a running member of a group
plan, or for a parent plan a parent linked to every child). **Parent links** (Account card, `AdminParentLinksButton`) shows a person's links
both ways and links a parent and child directly as ACCEPTED (both told, the child can still end it) or ends one. **Fix** on an approved
payment in the Money tab (`adminPaymentTools.ts`) corrects its amount or day (`reviewedAt`, noon Eastern) without touching what it paid
for. Any admin: lessons can be renamed (`updateLessonText`) and announcements edited (`updateAnnouncement`, which also rewrites the bell
entries still carrying the old words).

## Scholarships and Set up plan (added 2026-11-09)

A scholarship (`ScholarshipCode`, `scholarships.ts`) is a percent off the **6 Month plan only** (`SCHOLARSHIP_TERM`, `discountPercentForTerm`); 100% makes it free. A $0 plan bill settles itself (`settleFreeBill`, `freeBills.ts`) through the ordinary `approveZellePayment`, so a full-scholarship student is a regular subscriber who never pays: `installmentsPaid` counts up, credits and weekly classes arrive each 28 days, access is PAID (access never looks at the amount), and no bill stays open, so there is no bill bar, lapse or lock. The approval's bell says "Covered by your scholarship" for a $0 bill (one notice; `skipStudentNotice` / `settleFreeBill(id, { quiet: true })` when the caller tells the student itself). Plan notices never mention a payment on a $0 plan (`nextBillSentence`, `pauseMovesSentence` in `planSetupRules.ts`).

**A full scholarship is never a bill (the owner's rule, 2026-11-11; `scholarshipPlans.ts` database side, `scholarshipWording.ts` pure wording, `tests/db/scholarshipBills.test.ts`, `tests/scholarshipWording.test.ts`).** A student at 100% is never given a bill to pay and never reads "pay", "bill ready", "installment due" or "$0.00". Every place that could show or announce a plan bill leaves a $0 one out or settles it: `getOrCreateOpenInstallmentPayment` (settles on open), the daily `payment-plan-installments` job (first thing, `settleCoveredBills` settles every open $0 bill on a running plan and brings an unsent bill of a now-$0 plan down to $0; `notifyInstallment` and `sendPaymentPlanInvoiceEmail` return for a $0 amount; the overdue loop settles instead of escalating), `lapsePlanForNonPayment` (a solo plan whose price is $0 is settled and never canceled or locked), `getBillDue` (the bill bar needs `amountCents > 0`), `planBillTarget` and `resendPlanInvoice` (no $0 bill to resend), and every "overdue" or "due" list for the studio (`getAdminPaymentPlans.isOverdue`, follow-ups and reminders, Needs you, `getSubscriptionStats`, `getDueWeek`, the Data page, Today's `billOverdue`), which all need `installmentAmountCents > 0`. A new list or notice about bills must add the same condition. A scholarship raised to 100% while a bill is open and unsent makes that bill $0 and settles it (`claimScholarshipCode`, Set up plan); a bill already sent in for review with real money stays for the owner. Only an UNCLAIMED code can be edited (`updateScholarshipCode`), so editing never touches a running plan. The covered notice is `coveredBillNotice` ("Your scholarship covers your next 28 days. ... Nothing to pay.", button "See your classes"), a price moved to $0 is told as "Your scholarship covers your plan" (`planPriceChangeNotice`), and the record page of a covered bill shows "Covered" with no amount, payer or method (`buildReceipt`).

**Renewal past the sixth bill**: when a plan's LAST bill settles (`applyPlanInstallment`) and `planContinuesOnScholarship` says yes (solo, 6 Months, price $0, a claimed scholarship of 100% that is not ended, the account not banned, not payment locked, not an admin), the SAME `PaymentPlan` row goes on inside the approval's transaction: `termMonths` grows by 6 (`SCHOLARSHIP_RENEWAL_CYCLES`), it stays ACTIVE and `nextDueDate` moves to the end of the cycle, so there is never a moment without a running plan (access, the weekly time, weekly classes and credits all read an ACTIVE plan as before; no new row, no schema change, installment numbers just count on 7, 8, ...). One winner per approval makes it happen once. The student gets ONE notice in place of the per-bill one ("Your scholarship plan continues. Nothing to pay.", `afterScholarshipRenewal`, payments switch for the email) and it is audited as `plan.scholarship-renew`. Safety net in the daily job (`renewCompletedScholarshipPlans`): a COMPLETED solo 6 Month plan whose paid 28 days end within the bill lead days (and are not over yet), whose holder has a 100% scholarship and no other running plan, is reopened with one conditional update (price $0, the old price kept in `listAmountCents`, next cycle starting where the paid one ended) and its first covered cycle settled quietly. A plan that ended before the lead window, or whose paid days are already over, is not brought back (use Set up plan). A claimed scholarship has no end date (`expiresAt` is only the last day to CLAIM), so "expired" means ended by the owner.

**A partial scholarship (1 to 99%) is an ordinary bill that says what is left**: the due notice, the overdue notice, the invoice email (`scholarshipNote`), Resend bill and the overdue follow-up reminder add `scholarshipDueLine` / `scholarshipOverdueLine` ("Your 50% scholarship covers $90.00 of this bill. $89.99 is left to pay." / "With your 50% scholarship, $89.99 is left to pay."), computed from `PaymentPlan.listAmountCents` (the price before the discount) and the bill's own amount (`describeBillScholarship`, `partialScholarship`). The scholarship is not named when it is not what set the price: another plan length, a bigger personal discount, an exact price set by the owner (no list price), or a group bill (a group member's bill just asks for their share; the wording above is for solo plans).

**Set up plan** (owner only, first item in the student page's Plan menu, `AdminPlanSetupButton`, `planSetup.ts`): weekly time, first class (this week up to 12 weeks out) and scholarship (keep, Full, or a percent) in one step, from no plan, a plan waiting for its first payment, or a running plan (not group or parent plans, not while paused). Any scholarship means 6 Months. A scholarship given here is a `ScholarshipCode` row created already claimed (note "Given by the studio"), so Billing > Scholarships shows and ends it like any other. `PaymentPlan.startsAt` (Eastern midnight of the first class) holds the start: `applyPlanInstallment` starts cycle 1 on it when it is later than the approval, and a running plan's next bill and credit expiry move by the whole weeks between its current first class and the new one (either way; the same date again moves nothing). The plan builder clears `startsAt` when it re-anchors from a past date. One notice to the student (`planSetupNotice`); audited `plan.setup` and `scholarship.grant`. Tested in `tests/db/planSetup.test.ts` and `tests/planSetupRules.test.ts`.

**One booking rule for every weekly class**: `createReservedBookingIfAbsent` (the only way a plan's weekly class is booked: daily job, approval, time move, resume) refuses a class before the plan's `startsAt` or inside a pause window (`planMayBookAt`). Before this, the daily job ignored pauses, so moving a paused plan's weekly time let it book classes during the pause.

## Scholarships on group and parent plans (added 2026-11-12, `groupShares.ts`, `groupScholarship.ts`)

A scholarship belongs to ONE PERSON, so on a group or parent plan it takes its percent off THAT person's share only, on the 6 Month plan only. The group still has one per-person price (the family bundle's per-student price, or the solo price for one child); `groupShareCents(base, term, percent)` (pure, tested) is a person's share, and the first payment is the shares added up (`checkoutTotals` returns `sharesCents` for the screen; `createFamilyPlans` and `createParentPlans` price the same way on the SERVER from each account's claimed codes, `scholarshipPercentsFor`, never from the browser). A member's plan row carries their share in `installmentAmountCents` and the group price in `listAmountCents` (null when they get no scholarship). The owner's general personal discount is still not used in a group.

- **Who types a code.** The payer, on that person's row on the plan form (the small "Have a scholarship code?" on the row's own status line, 6 Months only; the payer's own row and a parent's "I'm learning too" row use the ordinary claim). `claimScholarshipForMember` accepts it only when the person has an ACCEPTED, fresh (7 day) group invitation from this payer or an ACCEPTED parent link, the code was made for THAT person's own email, and it is unclaimed, unrevoked and unexpired (`claimScholarshipCode(..., by)`, one caller). The code binds to the MEMBER's account, the tries count against the payer (10 an hour), and the member is told by a notice. Group invitations are spent when the group is created, so after that a family member claims their own in Settings; a parent link persists, so a parent can type a child's code any time. The payer sees a person's existing scholarship percent only once that person has accepted them (`scholarshipPercentForAccepted`, so the price on screen is right), never for an arbitrary address.
- **The price check runs after the acceptance check.** `expectedFirstPaymentCents` is compared INSIDE the transaction after "everyone accepted", so a wrong guess can never be used to learn a stranger's scholarship. A screen that shows the plain group total is accepted (the person pays the smaller real amount).
- **A covered share is $0 and never a bill.** A member's $0 bill settles itself (`settleFreeBill`) and `syncGroupBundle` never holds a $0 bill in the payer's combined bill. A group whose every share is covered starts by itself (`settleFreeStart`, `freeBills.ts`): nothing to pay, every plan running. The Plans page shows a payer whose own share is $0 the group's combined bill (`groupBill`).
- **After the group is running** a scholarship claimed or revoked changes that person's share from their NEXT bill (`applyToRunningGroupPlan` in `accountDiscounts.ts`; nothing already open is rewritten). A payer switching in from a solo plan gets their own share (the start payment less the others' plans, `payments.ts`), and a lone survivor pays the solo price less their own scholarship.
- **Not done:** a 100% group member does not renew past the sixth bill (the group plan completes with everyone's), and notices for a group bill do not name the scholarship.
- Tests: `tests/groupShares.test.ts`, `tests/db/groupScholarship.test.ts`.

## Finish the job where you are (added 2026-11-09)

The owner's rule: one job, one screen. Never answer "go to X first"; fix the cause in the same dialog (`PlanFixError` / `resolvePlanFix` / `PlanFixPanel` in `planFixes.ts` for plan tools; Set up plan returns its own `fix`). Links that carry a job (`?do=`, `?id=`, `?slot=`) are built by the helpers named below, never by hand.

- **Booking at any time** (`adminBooking.ts`, `adminBookingRules.ts`): Book a class on the student page offers any day and a typed start time, made on the spot as a hidden one-off slot (`adminBookClassAtTime`); days off ask "You don't usually teach Saturdays. Use it anyway?"; a past day records a walk-in (booked and marked Present). The picker reads times as the student sees them (`getOpenSlotsAction(studentId)`): "Reserved for them" (released when booked), another plan's time ("Sam's weekly time", `overridePlanHold`, admin-assisted only), contact holds. `NoFreeCreditError`: students keep their wording; the owner gets "Add 1 credit and book" in place (Book, Requests, Reserved > Book it), owner only (`topUpForOneClass` checks). `/admin/schedule?view=RESERVED&name=&email=&phone=` prefills a reservation. A reservation kept at a typed time on a day off (`oneOffReservationClash`) blocks every kind of booking that overlaps it: Book, Reschedule, family classes, extra sessions and a plan's weekly auto-booking.
- **Weekly times in one step** (`weeklyTimeOptions.ts`, `weeklyTimeRules.ts`, `weeklyWindowMove.ts`): Set up plan, Weekly time and the plan builder list every time no other live plan keeps (`getWeeklyTimeOptions`; `getReservableSlots` stays the students' list), with clashes named ("Sam has Dec 2", fixed by starting after it or `moveClashClassAction`), holds and waitlists. "Another time…" makes a 45 minute window in the same transaction (`ensureWeeklyWindow`, audited `schedule.add-time`). Editing a window that moves people refuses naming them, with "Move everyone with it" (`moveWindowWithEveryone`). Close a day can move its classes instead (`moveClosedDayClasses`). `AdminPlanSetupButton` opens on the `bnp-open-plan-setup` event (`detail.slot` as "scheduleId:chunkIndex" or `{ scheduleId, chunkIndex }`).
- **Student page does everything**: `?do=credits|book|plan|payments|setup|message|note|scale|support|discord` (`personActionHref` in `commandRecents.ts`; Cmd-K person jobs come from `personActionsFor`). The Money section is `PaymentQueue personView` (approve, reject, Mark paid, refund with "also cancel their classes", cancel bill, fix, receipt) with its own Notify switch on by default (place `payments`), because a payment result is something the student waits for. The Plan menu adds Resend bill, Record payment, Settle late payment, Cancel plan, a personal discount in Plan settings, and Group for every group the person pays for (`AdminPlanMoneyTools.tsx`). **Mark paid** (`markBillPaid`, owner, audited `payment.mark-paid`) records money that came another way. `/admin/payments?user=` / `?id=` / `?q=` via `adminPaymentLinks.ts`. Unmatched bank emails: "Find the student" (`attachReceiptToStudent`) opens their next bill when they paid early; amounts must still match, and when a group's freshly opened total differs every bill that open made is put back exactly as it was (`undoOpenedBills`, serializable, only ever restoring a bill still unsent and open), so nothing is left open early.
- **Today, Needs you, support**: `/admin/today?day=YYYY-MM-DD` (`teachingDayRules.ts`); each class row has a More menu (`ClassRowMenu`: Reschedule, Cancel, Message, Note, In person, next scale with "Release anyway" via `releaseNextScaleAction`, audited `scale.release`), "Send Discord steps", "Message this class" and a "Still to mark" group; Attendance and the top-bar panel reuse `ClassMoveCancelButtons`. Needs you is built from `getAttentionItems` plus overdue follow-ups (`buildNeedsYou`); expandable rows act in place (`NeedsYouList`). A support thread shows `SupportAccountPanel` (payments, classes, scale) and "Next open chat". Admin alerts link to the exact person or payment. The raw scale Unlock sends the same notice as approval (`sendScaleUnlockedNotice`).
- **People**: a Contacts class form entry has a More menu with Send sign-up link (`sendRegisterInvite(..., { fromStudio: true })`: no referral code, `/register?email=`) and Hold a time (Schedule > Reserved filled in); a contact with an account offers Set up plan with their held time. Follow-ups expand in place, "Remind all N", and headings open filtered lists (Accounts `?filter=trial|credits|discord`). A group or parent bill's reminder and Resend bill go to the payer, for the combined bill (`planBillTarget` in `planBillPayer.ts`). Staff > Add staff (`staffAdd.ts`). `/admin/messages?to=<id>,<id>` (`messageComposeHref`) opens a filled composer (Accounts bulk bar, side summary). A person's change history matches their plans', groups', payments' and classes' ids too (`accountAuditWhere`, `accountAudit.ts`). Sent messages show "Replied". System > Automatic tasks has owner-only Run now (`runJobNow`, `jobRunNow.ts`): every scheduled function exports `runX = () => runJob(...)` and is listed in `RUNNERS`. Admin > Lessons lists the database scales (`listScalesForLessons`), so a scale added on Roadmaps gets lessons.
- **Students** (`inPlaceLinks.ts`): `/billing/plans?slot=` preselects a weekly time and `?who=parent&child=` a linked child; `/lessons?changeTime=` opens the weekly-time picker; `/billing/history?pay=<id>` opens that payment's sheet (rows have Pay / Resubmit); the approval notice opens `/billing/receipt/<id>`; a parent group's bill notice goes to `/parent`, and a rejected bill that someone else pays (a parent or group payer) is reported to that payer with a link to where they pay (`rejectZellePayment`), never to the child. Onboarding keeps `?next=` through the phone-confirmation step too. Sign-up and onboarding carry `callbackUrl` / `?next=` (`safeCallbackPath` for every redirect taken from a URL). Discord connect returns to where it started (path signed into the OAuth state, `makeState` / `readState`); `JoinClassButton` becomes "Connect Discord and join". A group member with no weekly time lands on "Book a class"; a group plan's time is changed by asking (Atom), never self-changed. Billing > Plans has Pause, Change length and Cancel rows (`PlanControls`). A scholarship code can be claimed on the 6 Months card.
- **Parents and invites**: friend requests, parent links and group invites (`GROUP_INVITE`, bell not Mail) carry `?answer=<id>` (`bellAnswers.ts`) so the bell shows Accept / Decline (`answerFromBellAction`, same functions as their pages); a Mail row in the bell opens its target directly. A parent's request for an email with no account is saved (`ParentLinkInvite`, 30 days, same answer either way) and claimed when that account confirms its email (`claimParentInvites`). Home shows "Your child(ren)" and Parent mode in the sidebar and profile menu (never the dock); a paying parent is not pitched a trial. "Ask my parent to move or skip this" (`parentAsk.ts`, `PARENT_CLASS_ASK`) opens `/parent/<child>?move=<booking>`. "Ask to book together" sends a friend request by email (`askToBookTogether`). Every ask is a `FriendEmailAsk` row (account or not), and the sender's /friends "Sent requests" lists asks only as the typed email and "Waiting" (`getEmailAsksSent`; the linked friend request is left out of `getPendingRequestsSent`), so the list never tells whether an address has an account; an accepted ask becomes a friend, a declined one still reads "Waiting" until it is 30 days old. An ask only makes (and owns) a request when no request row of any status exists between the two people and neither blocks the other (`makeAskRequest`); everything else is left exactly as it was. A request later sent by username stops being the ask's, ask-made requests skip and do not count toward the hourly friend request cap, withdrawing an ask deletes its request unless accepted, and the data export lists asks only by the typed email (an ask-made request appears once accepted). So no screen, limit or export changes depending on whether an asked email has an account (`tests/db/askPrivacy.test.ts`). A request to someone you are already friends with is refused, never a reset to waiting. An ask to an address with no account becomes a real request once that account confirms its email (`claimFriendEmailAsks`, next to `claimParentInvites`). Withdraw removes the ask and its unanswered request.

## Bill bar and the non-payment lock (added 2026-11-02)

`BillBar` (`components/billing/BillBar.tsx`, under the top bar on every signed-in screen, cannot be closed) shows from the day a renewal bill (second payment on) opens, `payments.installmentLeadDays` before it is due, until it is sent. It reads `billDue` from the live status (`getBillDue` in `meStatus.ts`; a parent sees a child's parent-plan bill and goes to `/parent`, the child never does). Wording is `billBarText` (`billBarRules.ts`, tested): a friendly reminder through the due day, red "we still haven't received your payment" for 2 late days, then "You will lose access in X days". When `payments.lapseAfterDays` pass, `lapsePlanForNonPayment` cancels the plan as before AND `lockForNonPayment` (`paymentLock.ts`) sets `User.paymentLockedAt` on whoever pays the bill (never an admin, never for a first bill that never arrived) and bumps `sessionVersion`. A locked account is refused like a ban (`authorize`, `loginStepOneAction`, `getServerAuthSession`) with `PAYMENT_LOCKED_CODE` (`paymentLockCodes.ts`, browser safe), and every sign-in screen then opens the public `/account-locked` page (contact support opens Atom). Only an admin lifts it ("Lift payment lock" on the student page, audited `user.payment-unlock`); the canceled plan stays canceled.
