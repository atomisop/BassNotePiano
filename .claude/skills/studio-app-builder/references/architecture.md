# Architecture

The shape BNP converged on. "BNP ref" names the file to read for the reference implementation when the BNP repo is
available.

## Stack

| Concern | Choice | Notes |
|---|---|---|
| Framework | Next.js App Router, React, TypeScript strict | Server components by default; client components only for interaction. |
| Styling | Tailwind 4 with an `@theme` block | Tokens only, never raw hex or px in components. |
| Data | Prisma + Postgres (Neon in prod) | Hand-written migrations (below). |
| Auth | NextAuth, JWT sessions, credentials (password + emailed 6-digit code) | Google sign-in optional, never for admins. |
| Email | Resend (send) | Every send logged in `EmailLog`. Inbound (optional) via Mailgun routes. |
| Files | S3-compatible bucket (Cloudflare R2) | Private bucket for paid content, served through an access-checked route. |
| AI assistant | Gemini or Claude, server-side only | Deterministic handoff to a human, never LLM-decided. |
| Payments | Stripe Checkout + webhook by default; manual bank-transfer pipeline only on request | |
| Hosting | Netlify (site + scheduled functions) | `NODE_OPTIONS=--max-old-space-size=4096` in `netlify.toml`. |
| Errors | Sentry SDK pointed at Sentry or GlitchTip | `onRequestError` in `instrumentation.ts` + `reportError()`. |
| Tests | Vitest: `tests/` (pure, no DB) and `tests/db/` (real local Postgres) | Both run in CI. |
| Icons | ONE library behind `src/components/ui/appIcons.ts` | Never import an icon package elsewhere. |

## Scaffold

```bash
npx create-next-app@14 <name> --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm
```

Then: Tailwind 4 (`@tailwindcss/postcss`), `prisma`, `@prisma/client`, `next-auth`, `bcryptjs`, `zod`, `clsx`,
`tailwind-merge`, `class-variance-authority`, `@radix-ui/react-dialog`, `@radix-ui/react-switch`, `framer-motion` (dock and
drag only), `resend`, `vitest`, `tsx`. `.nvmrc` + `engines.node`. Scripts:

```json
"build": "sh -c 'if [ -n \"$DATABASE_URL\" ]; then npx prisma migrate deploy; fi' && next build",
"typecheck": "tsc --noEmit", "lint": "next lint", "test": "vitest run", "test:db": "vitest run --config vitest.db.config.ts",
"postinstall": "prisma generate", "hooks:on": "git config core.hooksPath .githooks"
```

`vitest.db.config.ts` refuses to run unless `DATABASE_URL` points at localhost. `.githooks/pre-push` runs typecheck, lint
and `npm test`. CI (`.github/workflows/ci.yml`): a `postgres:16-alpine` service, `npm ci`, typecheck, lint, test, build
(which migrates the throwaway DB), then `test:db`. BNP ref: `.github/workflows/ci.yml`, `vitest.db.config.ts`.

## Repo shape

```
src/app/(marketing)/      public: home, pricing, terms, privacy (+ the domain's own pages)
src/app/(auth)/           login, register, verify, reset, account-locked, wrong-account
src/app/(dashboard)/      signed in: home, the core feature, billing/*, messages, account (Settings), onboarding
src/app/(dashboard)/admin/  the operator console (six sections)
src/app/api/              route handlers: webhooks, me/status, calendar feeds, inbound mail
src/lib/                  xRules.ts (pure, tested) beside x.ts (DB); prisma.ts; auth.ts; settings
src/components/ui/        the design system pieces
src/components/<area>/    feature components
netlify/functions/        scheduled jobs, each wrapped in runJob
prisma/schema.prisma + prisma/migrations/<timestamp>_<name>/migration.sql
tests/  tests/db/  scripts/  docs/
```

## Patterns every module follows

- **Pure / DB split.** `bookingRules.ts` has no imports from Prisma and is unit-tested; `booking.ts` loads rows and calls
  it. Wording that depends on state (bill bar text, receipt lines, notices) is pure too. BNP ref: `billBarRules.ts`,
  `seatRules.ts`, `planSetupRules.ts`.
- **Settings, not constants, for anything the owner might change** (prices, trial length, lead days, switches): an
  `AppSetting` key/value table, typed accessors with defaults, a 10 s cache, `saveSetting` / `resetSetting` used by tests.
  BNP ref: `appSettings.ts`, `pricing.ts`.
- **Server actions return `{ ok: true, ... } | { ok: false, error }`**, never throw to the client. Validate with zod. Every
  action re-checks the session and role server-side, whatever the screen claims.
- **Idempotency** for money and booking: the page makes one key per attempt, the action wraps work in
  `runOnce(userId, scope, key, work)` backed by an `IdempotencyKey` table. BNP ref: `idempotency.ts`.
- **Audit log**: `audit(actorId, "area.verb", details)` on every admin change and every money event; a plain-English label
  map for the activity page. BNP ref: `audit.ts`, `auditView.ts`.
- **Notify scope**: admin actions take `notify: boolean` and run inside `withStudentNotice(notify, fn)`
  (AsyncLocalStorage) so the change happens without pinging the customer when the owner says so. BNP ref: `notifyScope.ts`.
- **Notifications**: one `createNotification({ userId, type, title, body, href, emailCategory })` that writes the bell row,
  sends the email if that person's switch allows it (with unsubscribe), and pushes for reminder categories. New kinds are a
  `NotificationType` enum value. BNP ref: `notifications.ts`, `emailPreferences.ts`, `unsubscribe.ts`.
- **Live status**: one `/api/me/status` poll a minute (skipped in background tabs) carries every badge count; actions call
  `announceChange("status")` so badges refresh at once; `revalidatePath("/", "layout")` after anything that changes what
  the shell shows. BNP ref: `liveEvents.ts`, `MeStatusProvider`.
- **Dates**: one business time zone constant; billing cycles are a fixed number of days via one `addBillingCycles`
  (never add months). Store UTC, display in the business zone.
- **Errors**: code that catches and answers 500 calls `reportError(err, context)`.

## Auth

- Register -> account created unconfirmed -> emailed 6-digit code (shared `verification.ts`: issue/verify per
  (email, purpose), rate limited, single use, short expiry, hashed). Trial or welcome starts on CONFIRMATION, not register.
- An unconfirmed account's password survives confirmation only if the browser that set it presents its claim token
  (stops "register someone else's address first"). BNP ref: `pendingSignup.ts`.
- Passwords: 8+ chars and one special character, strength bar on every password screen, bcrypt.
- Sign-in by password or "email me a code". Admins: password + emailed code every time (two-step), never Google.
- `sessionVersion` on the user, checked in the `jwt` callback; bump it to sign out everywhere (password change, ban,
  "sign out other devices"). `bannedAt` refused in `authorize` and on every request.
- Rate limit sign-in, register, code issue and any lookup whose answer reveals whether an email has an account. Answer
  identically for "no such account" and "banned".
BNP ref: `src/lib/auth.ts`, `verification.ts`, `passwordRules.ts`, `ban.ts`.

## Migrations

Hand-written SQL that matches Prisma's own output (`-- CreateTable`, `-- AddForeignKey`, FK names `Table_field_fkey`,
`ALTER TYPE ... ADD VALUE` for enums). Verify before every push:

```bash
service postgresql start
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'postgres';" -c "CREATE DATABASE app_verify;"
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/app_verify?schema=public" DIRECT_URL="$DATABASE_URL"
npx prisma migrate deploy
npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script
# must print: -- This is an empty migration.
```

On a brand-new project the FIRST migration may come from `prisma migrate diff --from-empty --to-schema-datamodel ... --script`;
after that every migration is hand-written and verified the same way. Never drop a table in the same migration that stops
using it.

## Operations

- **Scheduled jobs** (`netlify/functions/*.ts` with `schedule`): each body is `runJob(name, fn, { quietWhen })`, which
  records a `JobRun` row (quiet runs throttled) and honours a pause switch. `job-watchdog` every 30 minutes compares each
  job's last success to its window (`JOB_MAX_SILENCE_HOURS`), emails the owner once, and pings an outside monitor
  (`HEALTHCHECK_PING_URL`, `/fail` when anything stopped). A job that runs every few minutes must be nearly free when idle:
  one cheap check first, then return. `keep-warm` (GET `/login` every 5 minutes) never touches the DB. BNP ref:
  `jobRun.ts`, `netlify/functions/job-watchdog.ts`, `discord-class-channels.ts`.
- **Backups**: nightly encrypted dump of every table to the bucket under `backups/`, plus a restore script. A watched job.
- **Email log**: every send, failure and suppressed send gets a row (address, subject, status, reason, never the body);
  the provider's signed webhook advances status. Purge after 180 days.
- **Staging**: `APP_ENV=staging` adds a badge, `noindex`, and an email allow-list guard inside `sendEmail`.
- **Releases**: production deploys from a `release` branch fast-forwarded to green `main` once a day (and on demand), so
  each merge does not cost a production build. BNP ref: `docs/RELEASES.md`, `.github/workflows/release.yml`.
- **Security headers**: strict CSP (start report-only with a `/api/csp-report` collector), HSTS, frame-ancestors none.
- **PWA**: manifest, icons, a service worker that serves only an offline page; optional web push with VAPID keys.
