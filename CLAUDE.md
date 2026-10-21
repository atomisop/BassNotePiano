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
scheduled Netlify function wraps its body in `runJob` (`src/lib/jobRun.ts`) so
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
- `src/app/(dashboard)/admin`, the sole admin's console. Nav is
  `src/components/admin/AdminNav.tsx`: one grouped list on the left from md up (icons, count badges, Settings pinned underneath), one swipeable row on phones. Groups: Overview / Billing (Payments, Payment Plans) / People (**Applications**, **Accounts**, Employees) / Teaching (Schedule, Lessons, Discord) / Inbox (Support Chat, Messages). Each label matches its page heading; pages keep their own tabs only for statuses and filters.
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
and shows as an item in the Overview's "Needs you now".

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
  keeps access to the end of the paid month. A COMPLETED plan (every Monthly
  one) does not advance `nextDueDate` on its last installment, so its paid
  period ends one month *after* it (easy to get wrong, it was).
- `User.hasCurriculumAccess` is now only the admin's complimentary override
  (`COMPED`). The migration cleared every existing flag (they were all free
  grants). The JWT's copy is display-only; the edge no longer gates scales.
  `getRoadmap`/`canAccessScale` in `src/lib/access.ts` (DB-authoritative) are
  the real gate, via `decideScaleAccess`.
- **Fifth class (decided 2026-10-21): free on 3-month and 6-month plans, optional and paid on Monthly.** `isCommitmentTerm` / `classesInPaidMonth` (`paymentPlans.ts`) give a commitment plan every weekday in its cycle; a Monthly plan covers four and can add the fifth through `getFifthClassOffer` / `createFifthClassPayment` (owner price `payments.fifthClassPriceDollars`, default $55 (the regular rate), same pay screen as an extra class, card on Lessons > Extra sessions, link on the receipt). A fifth already given (marker row) is never taken back. Details of the cycle count follow.
- **A paid month is every one of the student's weekday inside the billing cycle (commitment plans).** The cycle runs from one billing date to the next, so it holds four OR five of that weekday (any subscriber meets a five-class cycle about 4 times a year, in months that depend on their start date). `classesInPaidMonth` (`paymentPlans.ts`) counts them with `classesInWindow` (`classSchedule.ts`); the installment still grants four classes of credit and `topUpIfFifth` adds the fifth class's credit once per cycle (marker `plan-fifth-class:<plan>:<cycle start>` in AppSetting), good until the next billing date. Access never depends on credits; extra time that week is an extra session (`SUBSCRIBER_CLASSES_PER_WEEK` = 1).
- **Teacher-approved drip.** Full access opens Scale 1 only. Each next scale
  opens when the teacher approves it (`approveNextScale` in
  `src/lib/scaleApproval.ts`, button on `/admin/progress`): eligible when the
  previous scale's checklist is complete and 7+ days passed since the last
  unlock; the admin can force past both. Approval sets
  `ScaleProgress.unlockedAt`, which only counts while entitlement is active.
- **Free trial**: approving a class application sets `User.trialEndsAt` (3
  days, once per person, never cleared) or it starts at registration if they
  had no account yet. Trial opens only Scale 1's first 3 lessons
  (`TRIAL_LESSON_COUNT`), no practice/quiz; locked lessons are sent to the
  client as titles only.
- **Yearly (`TERM_12`) is retired** for new enrollments
  (`isPlanTermOffered`), enum value kept for existing rows. Note that term
  discounts are still not a real commitment: a student can self-cancel.
- **Lesson files are served by the app** (added 2026-10-13, `docs/PRIVATE-LESSON-FILES.md`): the player and download links use
  `/api/lessons/[lessonId]/file`, which checks access (trial slice included), stamps the student's name and email on every PDF page
  (`lessonWatermark.ts`) and is never cached. Lessons live in a private bucket (`R2_PRIVATE_BUCKET_NAME`, `fileUrl` = `private:<key>`);
  until that is set and `scripts/move-lessons-private.mjs` has run, the old public addresses still work through the same route.

## Family plans (added 2026-10-14, `docs/FAMILY-PLANS.md`)

2 to 4 accounts, one `PaymentPlan` each at the family rate (`FamilyPlanGroup`), all created in one transaction (any member that cannot start
stops everyone). The payer pays one combined `FAMILY_PLAN_START` first payment whose approval starts every plan at once; from month two each
member has their own bill. Only the payer's bank account settles family money (`familyPayerOf`). A failed start lapses the whole group.
The old one-payment `FAMILY_BUNDLE` page now redirects to `/billing/plans`.
A subscribed payer switches in (`FamilyPlanGroup.replacesPlanId`): password plus emailed code, the old plan runs until the combined payment is
approved and is then replaced in the same transaction. A member leaving one short of two bills the survivor at the solo price; the payer
leaving ends the family (members keep the month paid). One family change per `family.changeCooldownDays`.

## Contacts and soft holds (added 2026-10-20)

Admin > People > Contacts (`src/lib/contacts.ts`, `src/app/(dashboard)/admin/contacts/`) is one list of everyone: accounts (classes taken, next class,
the weekly time a payment plan reserves), applicants with no account (`ClassRegistration`), and people added by hand (`Contact`, with a status, notes
and a `ContactSession` log of the days they took a class). A `SlotHold` keeps one weekly hour (schedule + `chunkIndex`, optional `until`) for a
contact. It is a reminder only: nothing in `classSchedule.ts` reads it, so it never blocks a booking. The admin booking screen
(`AdminManualBooking`) asks "This slot is reserved for X" before booking over one (`holdAppliesTo` in `slotHolds.ts`). The popup is admin only;
students never see a contact's name.

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
  sign-in and security, connected accounts, privacy and data incl. download, delete). The content is rendered
  twice (desktop column and phone slide-over), so never use DOM ids inside it.

Top-of-screen banners (`IosBanner`, `TopBanners` in `components/ui/`, mounted in `(dashboard)/layout.tsx`) look like an iPhone
notification and show one at a time, only while the tab is visible and never over the tour or the "what's new" popup. The phone
banner shows at most once per calendar day (localStorage `bnp-phone-banner-day`). The Discord banner shows to anyone with no
`discordId` and comes back after `discord.promptRepeatMinutes` (default 10) whenever it was ignored or closed
(`bnp-discord-banner-next`); lengths and the on/off switch are owner settings (`phone.promptSeconds`, `discord.prompt*`, default 8 seconds).

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
  through the rest): Discord invitation until linked, next class countdown, low credits, fifth class, scale unlocked / waiting, streak, continue lesson,
  friends practicing; admins get jobs stopped, needs-you counts and today's classes. Each is a true fact with one tap; add a new kind to the `SidebarCard` union.
- **Signed-in devices** (Settings > "Where you are signed in"): `KnownDevice` rows (browser + OS, never the IP) with city/region/country from the host's geo headers
  (`placeFromHeaders`, Netlify `x-nf-geo` is unverified in production), `signedInAt`, and `lastSeenAt` touched by `/api/me/status` (about once a minute per open tab).
  Active = checked in within 5 minutes. "Sign out other devices" deletes the other rows. Sessions are JWT, so there is no per-device sign-out.
- **Follow-ups** (`adminFollowUps.ts`, Overview + morning email; one-click reminders in `followUpReminders.ts`): overdue bills, not practicing, trial ending, credits
  expiring, stale applications. A reminder uses fixed wording, re-checks the reason, goes once per person per reason per day, and is audited (`followup.reminder`).
- **Session lookup cache**: `loadEntitlementsBounded` remembers a user's entitlements for 5 seconds per server (sign-in and `update()` read fresh; the ban check is live).
- **Admin student page** has Overview / Learning / Classes / Money / Support tabs; sections stay mounted (hidden), the tab is kept in the URL hash.
- **Top banners** never ask for what the screen already shows (`alreadyShown` in `TopBanners.tsx`): no Discord banner on Lessons or at desktop width (the sidebar card
  carries it), no practice banner on Practice, no phone banner on Settings.

## Email opt-out, Atom notice, accessibility (added 2026-10-21)

- **Unsubscribe**: every email a switch governs (anything sent through `createNotification` with an `emailCategory`, announcements and admin messages, payment-plan
  bills) carries a signed link (`src/lib/unsubscribe.ts`, HMAC of user + category, no sign-in) to `/unsubscribe` (a page that only asks) and a `List-Unsubscribe`
  one-click POST header to `/api/unsubscribe` (the only thing that changes a switch). Sign-in codes, security alerts, the welcome email, applicant replies and owner
  emails carry none, on purpose. Pass `unsubscribe: { userId, category }` when adding a new email of that kind.
- **Atom** shows what it is and what is kept before anyone types (the empty-state paragraph and the footer line in `AssistantWidget.tsx`); keep it in step with
  `PrivacyContent.tsx` and the privacy summary in `assistant.ts`.
- **Accessibility**: run axe-core (WCAG 2.2 AA + best-practice) against the signed-out pages, Home, Lessons, Settings, Billing and the admin screens after UI changes.
  Custom modals must use `useDialogFocus` (focus in, Tab trapped, Escape, focus back). Never put `aria-label` on a bare `p`/`span` without a role; icon targets are at
  least 24px; links inside running text are underlined.

- **Emailed links are for one person**: `tagAppLinks` tags every page link in an email (only `/api` and files are left alone, sign-in and reset steps included) and
  the middleware stops a different signed-in account on ANY tagged page, public ones like `/unsubscribe` too, with the "Sign in with the right account" screen
  (`/wrong-account`; a public target simply opens once they sign out). Any link the app builds from inside a page that is about another person (such as the
  unsubscribe confirmation's settings link) must carry their tag too (`settingsLinkFor`).

## Abuse guards (added 2026-10-12, `docs/ABUSE-AUDIT.md`)

One free trial per inbox forever (`trial-used:` marker, plus tags dropped at every domain); an unpaid first bill releases the weekly
time after `payments.firstBillLapseDays`; new lesson files get a random key. Read `docs/ABUSE-AUDIT.md` before changing money,
booking or access code: it lists what was checked and the business decisions left open.

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

`User.bannedAt` (+ private `bannedReason`) is set by `banUserAction` (`admin/users/[userId]/actions.ts`, hammer "Ban" button
top right of the Account card on the student page, with a confirm step; "Lift ban" reverses it; both audited as `user.ban` /
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

## Workflow this session (and prior Claude sessions in this repo) actually follow

1. Branch per unit of work, PR against `main`, `subscribe_pr_activity`,
   watch CI (Netlify's own deploy-preview check is typically the only
   status check), merge (squash) once green and mergeable.
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

## Activity log (added 2026-10-21)

Admin > Overview > Activity (`/admin/activity`, owner only) is a searchable view of `AuditLog`: text search over action, details and actor email, a kind filter
(the part of the action before the dot), a date range (30 days by default) and `?user=<id>` for one account's changes. 50 per page. Plain-English action names
live in `src/lib/auditView.ts`; an action not listed there shows as its code, so add a label when you add a new audited action. The student page's change log links to it.
