# Staging: the safe testing copy of the app

Staging is a second copy of the site with its own database. Nothing done there touches real students, real emails or real money. The
five smoke checks (`npm run smoke`) run against it every night and on demand, and tell you if sign in, classes, parent mode or the
payment email pipeline broke.

## What staging does differently (the app does this by itself when `APP_ENV=staging`)
- A small amber **STAGING** tag at the top of every page.
- Hidden from search engines (`noindex`).
- **Never emails real people.** Only `@bnp-test.local`, `@example.test`, `@example.com` and anything in `STAGING_EMAIL_ALLOWLIST`
  (comma separated addresses or `@domains`) get email. Everything else is logged as "[staging] email to ... not sent" (subject only).
- `/api/staging/open-test-payment` exists (it answers 404 on the live site) so the checks can create a test payment.

## One-time setup (about 20 minutes, in this order)
1. **Neon:** open the project, create a branch called `staging` from `main` (Branches > New branch). Copy its two connection strings
   (pooled and direct). This is a separate database: nothing you do in it reaches the live one.
2. **Netlify:** Site configuration > Branches and deploy contexts > turn on **Branch deploys** for the `staging` branch (create it with
   `git branch staging && git push -u origin staging`). The deploy gets its own address, like `https://staging--YOURSITE.netlify.app`.
3. **Netlify environment variables, scoped to the `staging` branch deploy only** (Site configuration > Environment variables > "Different value for each deploy context"):
   - `APP_ENV` = `staging` and `NEXT_PUBLIC_APP_ENV` = `staging`
   - `DATABASE_URL` and `DIRECT_URL` = the staging Neon branch's strings (NOT the live ones)
   - `NEXTAUTH_URL` = the staging address, and a different `NEXTAUTH_SECRET` than live
   - `STAGING_SMOKE_TOKEN` = a long random string (32+ characters)
   - `MAILGUN_SIGNING_KEY` and `PAYMENT_INBOX_TOKEN` = any long random strings (staging has no real Mailgun; the checks sign their own test emails)
   - Leave `RESEND_API_KEY`, `DISCORD_*`, `VAPID_*` and the Zelle handle unset or set to test values.
4. **Seed the test accounts** (once, and again any time you reset the database):
   ```
   I_AM_SEEDING_STAGING=yes STAGING_SEED_PASSWORD='a long password' DATABASE_URL='<staging direct string>' node scripts/seed-staging.mjs
   ```
   This makes `admin@`, `student@`, `parent@`, `child@` and `child2@bnp-test.local`, three class windows, a parent link, a parent-paid plan and two classes.
5. **GitHub secrets** (repo Settings > Secrets and variables > Actions): `SMOKE_BASE_URL` (the staging address), `STAGING_SEED_PASSWORD`,
   `STAGING_SMOKE_TOKEN`, `MAILGUN_SIGNING_KEY`, `PAYMENT_INBOX_TOKEN` (the same values as in Netlify).

## Using it
- Merge into `main` as usual; it goes live with the next daily release (`docs/RELEASES.md`). To try something before it goes live, push the branch to `staging`: `git push origin my-branch:staging --force`.
- Run the checks yourself: `npm run smoke` with the same values as environment variables (see the top of `scripts/smoke/run.mjs`).
- The checks also run by themselves every night (`.github/workflows/staging-smoke.yml`) and from the Actions tab (Run workflow).
- Try a bank email by hand: `node scripts/send-test-bank-email.mjs <staging address> <BNP-CODE> <amountCents> [pass|soft|fail]`.

## The five checks
1. **Site and security:** public pages load, signed-out visitors are sent to sign in, security headers are on, staging is hidden from search, the test endpoint and a forged payment webhook are refused.
2. **Sign in and roles:** a wrong password is refused; student, admin, parent and child can sign in; the admin console opens for the admin only.
3. **Classes and schedule:** the student's lessons page shows class times, the plan screen opens, the admin schedule, reserved days, attendance and today screens load.
4. **Parent mode:** the parent sees the linked child, opens their page (classes, plan, end-plan), the child sees the lock, a stranger gets a 404.
5. **Payments pipeline:** a verified bank email approves a test payment; one with no verdict but the bank's signature and Gmail's pass approves it and leaves it unchecked; a failed signature with the code only holds it; a wrong amount and a wrongly signed request do nothing.

## When a check fails
The run prints the first failing line of each step. Re-run just one check with `SMOKE_ONLY=4 npm run smoke`. A failure on staging that is not on the live site usually means staging's settings differ (an environment variable, a missing seed); the seed command is safe to run again.
