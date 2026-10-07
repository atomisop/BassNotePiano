# Availability & Recovery

STEP 24 of the master production plan. Written for the person actually
running this app (not assumed to be an engineer) to use *during* a real
problem, not just to read once. Plain language, concrete steps, no jargon
left unexplained.

The stack this all refers to: **GitHub** (code) → **Netlify** (hosting,
auto-deploys on push to `main`) → **Neon** (the Postgres database) →
**Cloudflare R2** (lesson videos/PDFs, avatars).

---

## 1. Health check

`GET /api/health` — added this step. Returns:

```json
{ "status": "ok", "database": "ok", "checkedAt": "..." }
```

or, if the database can't be reached, HTTP 503 with `"status": "error"`.

This is the one URL to check FIRST when something seems wrong, and the one
to point an external uptime monitor at (e.g. UptimeRobot, Better Uptime —
free tiers exist, ~1 minute to set up: give it
`https://<your-domain>/api/health` and it'll text/email if it ever fails).
It doesn't require logging in — it's meant to be hit by a robot, or by you,
without a password.

## 2. Backup strategy

**Database (Neon):** Neon takes continuous backups automatically — this is
part of the product, not something to configure. On Neon's free tier, you
can restore to any point in the last 24 hours; paid tiers extend that
window (check your current plan at console.neon.tech under
Settings → Billing if the exact window matters for a specific incident).
Nothing to set up here — just know it exists.

**Database, second copy (nightly, encrypted):** besides Neon's own backups, a
scheduled job (`netlify/functions/db-backup.ts`, every night at 06:30 UTC) copies
every table into one encrypted file in the R2 bucket under `backups/` and keeps the
last 35 days. It is encrypted before upload because the bucket is public. It checks
that the stored file is the right size and that the key opens it. If it fails, or
stops running, the job watchdog emails the owner within the hour. One-time setup:
in Netlify's environment variables add `BACKUP_ENCRYPTION_KEY` (32 random bytes as
base64: run `openssl rand -base64 32`), and **keep a copy of that key somewhere safe
outside Netlify** (a password manager). Without it a backup cannot be opened.

**Lesson videos/PDFs (R2):** this is the one gap worth knowing about
plainly. R2 does **not** version or back up objects by default, and this
app doesn't currently enable R2 versioning. In practice: whatever file you
uploaded through the admin panel is the only copy the app knows about,
unless you *also* kept the original file on your own computer after
uploading it. Recommendation: keep your own local copies of lesson videos/
PDFs (wherever you already store them before uploading) — treat R2 as
"where the app serves files from," not as your archive.

**Code (GitHub):** every change ever made is in Git history — this is
already a complete backup by nature, nothing to add.

## 3. Restore procedure

**Database:** Neon console → your project → the "Restore" or "Branching"
feature → pick a point in time before the problem → Neon creates a restored
branch → verify it looks right → point `DATABASE_URL`/`DIRECT_URL` (in
Netlify's environment variables) at the restored branch, or follow Neon's
own "restore to main" flow if you want the original connection strings to
keep working unchanged. Neon's own docs walk through this with screenshots
— search "Neon point-in-time restore" if you're mid-incident and need the
exact clicks.

**From the nightly backup:** download the day's file from the bucket
(`backups/YYYY-MM-DD.json.enc`), then on a computer with the project run
`BACKUP_ENCRYPTION_KEY=<your key> node scripts/restore-backup.mjs <file> > backup.json`.
The result is one readable file with every table's rows, so a single student, payment
or booking can be looked up or put back by hand.

**A single lesson file:** re-upload it through `/admin/lessons` from your
own local copy (see the backup note above — this is why keeping local
copies matters).

## 4. Deployment rollback

Netlify keeps every previous deploy. Netlify dashboard → your site →
**Deploys** tab → find the last deploy that was working → the "..." menu on
that deploy → **Publish deploy**. This is instant and doesn't touch the
database at all — it only changes which built version of the code is
live. Use this first if a recent code change broke something; it's faster
and safer than trying to fix-forward mid-incident.

## 5. Migration safety

Database schema changes go through Prisma (`prisma/schema.prisma` +
`prisma/migrations/`). The one rule that matters: **never run
`prisma migrate dev` against the live database** — that command is for
local development only (it can reset data). Production migrations should
go out as `prisma migrate deploy`, applied automatically as part of the
Netlify build (already how this is wired — check `package.json`'s
`postinstall`/build scripts if that ever needs confirming).

Before a schema change that removes or renames a column/table: deploy code
that stops USING the old column first, confirm it's live and working, only
then migrate the column away. A migration and a code deploy that both
assume the new schema, landing at slightly different times, is the classic
way this kind of change breaks a live app.

## 6. Incident checklist

1. Check `/api/health`. Database problem, or something else?
2. Check Sentry (once a DSN is configured — see `docs` from Step 21) for
   what error is actually happening and how often.
3. Check Netlify's **Deploys** tab — did a deploy just go out around when
   this started? If yes, roll back (Section 4) before investigating further
   — restore service first, diagnose after.
4. Check Neon's dashboard for the database's own status/metrics if
   `/api/health` reports the database as unreachable.
5. If it's a data problem (not a code/deploy problem), Section 3 covers
   restoring from backup.

## 7. What was actually tested this step

The health endpoint was run locally against the local dev database and
confirmed working (`{"status":"ok","database":"ok",...}`) — that's the
"recovery workflow tested outside production" this step calls for. A real
database restore was **not** performed against the live Neon database as
part of this step — doing that against real production data wasn't
something to try unprompted. If you want that actually rehearsed once
(recommended, but your call on timing), the way to do it safely: create a
throwaway Neon branch, restore it to a past point, confirm the data looks
right, then delete the branch — never touches the real database, costs
nothing, takes a few minutes.
