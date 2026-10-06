# Engineering memory — Bass Note Piano

Technical/engineering context for working in this repo. For product
positioning, brand voice, and business rules, see `PRODUCT.md` — this file
doesn't repeat that, it covers architecture, conventions, and how to
actually get a change safely merged.

Written after catching up on a large amount of history I (this session)
wasn't present for — treat anything below as current as of the `main` HEAD
it was written against, and re-verify anything load-bearing (prices, a
model shape, a nav label) against the actual code before relying on it,
since this file will drift.

## Stack

Next.js 14 (App Router) · React 18 · TypeScript 5 · Tailwind 4 · Prisma 5 +
Postgres (Neon in prod) · NextAuth 4 (JWT sessions, credentials-only —
password + emailed 6-digit code, no OAuth) · Netlify (hosting + deploy) ·
Google GenAI (Gemini) for the Atom assistant · Resend (email) · Cloudflare
R2 via `@aws-sdk/client-s3` (lesson media, avatars) · GlitchTip (error
monitoring — **not Sentry.io**, despite the `@sentry/nextjs` SDK package
and `sentry.*.config.ts` filenames; the DSN just points at GlitchTip's
self-hosted-compatible endpoint) · Discord (live lessons happen there now,
**not Zoom** — `src/lib/discord.ts`).

Node 24 pinned (`.nvmrc` / `engines`). A small Vitest suite lives in `tests/`
(`npm test`, pure logic and the calendar routes, no database) and runs in CI.
`tsc --noEmit`, `next lint`, `next build` and the tests are the correctness
gates, plus manual verification against a real Postgres (see below). Every
scheduled Netlify function wraps its body in `runJob` (`src/lib/jobRun.ts`) so
the owner overview and the morning email can show a job that stopped.

## Repo shape

- `src/app/(marketing)` — public pages: home, `/classes`, `/pricing`,
  `/shop` (recommended instrument gear, external links), `/terms`,
  `/privacy`.
- `src/app/(auth)` — login/register/reset/verify, credentials-only.
- `src/app/(dashboard)` — everything behind a session: `/dashboard`,
  `/scales/[slug]` (the course player), `/lessons` (live class booking),
  `/billing/*`, `/friends`, `/messages` (1:1 + group), `/account`
  (tabbed settings — password, notifications, appearance, tutorials,
  **Delete Account** danger zone), `/profile`, `/about`.
- `src/app/(dashboard)/admin` — the sole admin's console. Nav is
  `src/components/admin/AdminNav.tsx` (a `<select>` on mobile, pills on
  desktop): Overview, Payments, Bookings, **Schedule** (self-service weekly
  class schedule management), Students, Roster, Lessons, Users, Credits,
  Messages, **Support Chat**, Announcements.
- `src/components/assistant/AssistantWidget.tsx` — Atom, the floating
  assistant on every page (mounted once in `providers.tsx`). See "Atom /
  Support Chat" below — this has had several rounds of follow-up fixes
  since it first shipped.
- `prisma/schema.prisma` + `prisma/migrations/` — every migration is a
  hand-written `.sql` file (see "Migrations" below, this is not incidental).

## Migrations — always hand-written, always verified against a real Postgres

No session so far (including this one) has had live credentials to the
production Neon database. Every schema change in this repo's history was
written as raw SQL by hand, matching Prisma's own conventions exactly
(`CREATE TYPE`/`ALTER TYPE ... ADD VALUE`, `CreateTable`/`AddForeignKey`
comment-headers, FK names as `Table_field_fkey`), then verified — not just
assumed correct — against a locally-installed throwaway Postgres before
ever being pushed:

```
service postgresql start   # or: pg_ctlcluster 16 main start
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'postgres';"
sudo -u postgres psql -c "CREATE DATABASE bnp_verify;"
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/bnp_verify?schema=public"
export DIRECT_URL="$DATABASE_URL"
npx prisma migrate deploy        # applies the FULL migration history in order
npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script
# must print "-- This is an empty migration." — i.e. zero drift from schema.prisma
```

Drop the throwaway database afterward. This is the one reliable way to know
a hand-written migration is actually byte-correct before it ever touches a
real database — `prisma migrate diff` against the applied result catching
zero drift is the bar, not "it looks right."

**The build now actually runs migrations in production.** `package.json`'s
`build` script is:
`sh -c 'if [ -n "$DATABASE_URL" ]; then npx prisma migrate deploy; fi' && next build`
— guarded so an environment with no `DATABASE_URL` (a contributor's bare
`npm run build`, some future CI context) still builds exactly as before.
This exists because for a while it *didn't* — a whole PR's worth of new
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
  `AssistantFeedback` table) — changeable, not locked after one click.
- A triage: a thumbs-down or a plain-English "talk to a human" hands the
  conversation to `/api/assistant/escalate`, which creates an
  `AssistantEscalation` + seeds `SupportMessage` rows from the pre-handoff
  transcript, and notifies every admin (`Notification` type
  `ASSISTANT_ESCALATION`).
- From there the widget is in **live support mode**: it polls
  `/api/assistant/support/[id]` for new messages instead of calling the
  LLM. Senders are `VISITOR` / `ATOM` / `SUPPORT` — an admin's reply is
  always `SUPPORT`; the replying admin's real identity (`sentById`) is
  recorded for internal accountability only and is never present in
  anything the visitor-facing route returns. A signed-in visitor's thread
  is locked to their own session (`loadEscalationForVisitor` in
  `src/lib/support.ts`); an anonymous one trusts the unguessable escalation
  id as a bearer credential, same trust model as elsewhere in this app.
- The admin side is `/admin/support` (`src/app/(dashboard)/admin/support/`,
  `src/components/admin/SupportChatPanel.tsx`) — a two-pane live inbox with
  polling, an unread indicator, and "Mark resolved." Replying again after
  resolved naturally reopens the thread.

**This has been fixed forward multiple times since it first shipped** —
commit history includes "Fix Atom getting stuck on a conversation support
already closed," "Support chat: fix stale thread switching, add permanent
delete," and "Fix support chat showing the wrong thread's messages while
loading." There's also a migration named
`add_assistant_conversation_history` after the original Support Chat one —
re-read `src/lib/support.ts` and the current `SupportMessage`/
`AssistantEscalation` shape directly before assuming the design above is
still exactly accurate; treat this section as "how it was built," not a
guarantee of the current byte-for-byte shape.

A **separate** persistence mechanism now also exists for ordinary (non-
escalated) Atom chats, per the current system prompt in
`src/lib/assistant.ts`: a signed-in visitor's regular conversation with Atom
is saved to their account and readable under Settings → Privacy & Data,
auto-deleting after 30 days; an anonymous visitor's ordinary chat is never
stored server-side at all (only an escalated one is, via the mechanism
above — that's a deliberate, disclosed exception, since a human then needs
to read it). Atom currently teaches piano/guitar/bass only — drums and
voice are "coming soon" on the public interest-registration form, and the
system prompt explicitly forbids implying either is bookable today.

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
- Still open: lesson/PDF files live at public R2 URLs, so page gating doesn't
  stop someone who has the URL. Watermarked, in-app-only PDFs are the planned
  follow-up.

## Sessions can now be invalidated server-side

`User.sessionVersion` (a plain incrementing int) plus a check in the NextAuth
`jwt` callback (`src/lib/auth.ts`) is what makes "changing your password
signs out other devices" and the explicit "Sign out other devices" account
action (`signOutOtherDevicesAction`) actually work — every other open
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
  all funnel through `src/lib/verification.ts` — one shared issue/verify
  function, rate-limited per (email, purpose), single-use, short expiry.
  Add a new `VerificationPurpose` enum value rather than inventing a
  parallel mechanism.
- Destructive/high-stakes admin and account actions get an explicit
  confirmation step in the UI (see the "Add confirmation steps for
  high-stakes admin actions" commit, and the Delete Account danger-zone
  pattern in `/account`) — red button, explicit irreversibility copy,
  password + emailed code re-verified server-side on the final step
  regardless of what the client claims already happened.
- Touch targets: any button or link shorter than 44px gets the `tap` utility
  (`globals.css`), which enforces a 44px minimum on touch devices only, so
  desktop is unchanged. Links need `inline-flex items-center` for it to apply.
  Sits next to the 16px-input rule: both exist because the app is used mostly
  on phones. Check new screens at 390px.
- Phone card stacks: a group of cards that would otherwise be a long scroll on
  phones goes in `CardDeck` (`components/ui/CardDeck.tsx`), as on Home. Render
  each card via a function called once per place it appears: reusing one
  element that contains a streamed `<Suspense>` in two spots breaks hydration.
- No em dashes in copy or code comments written for this project (a
  standing, explicit brand rule from `PRODUCT.md` — this repo's own
  history includes a dedicated cleanup commit for stray ones).

## Workflow this session (and prior Claude sessions in this repo) actually follow

1. Branch per unit of work, PR against `main`, `subscribe_pr_activity`,
   watch CI (Netlify's own deploy-preview check is typically the only
   status check), merge (squash) once green and mergeable.
2. If the assigned branch's PR was already merged, **restart it from the
   latest `main`** (`git fetch origin main && git checkout -B <branch>
   origin/main`) and cherry-pick only the genuinely new commits forward —
   never stack new work on top of already-squash-merged history, since
   that reintroduces the whole old diff against the now-different `main`.
3. Full verification before every push: `tsc --noEmit`, `next lint`,
   `next build`, plus the Postgres-backed migration/runtime check above for
   anything schema-touching, plus a security-review pass.
4. A LOT of independent work has landed on `main` outside any session this
   context remembers (mobile/accessibility fixes, a full homepage redesign,
   Discord + fretboard + Shop-page additions, admin self-service schedule
   management, the GlitchTip switch, family booking, session-versioning...).
   **Don't assume the state you last touched is still current** — `git log
   origin/main` and a targeted `git show origin/main:<path>` for anything
   load-bearing before making a change, the same way this file was written.
