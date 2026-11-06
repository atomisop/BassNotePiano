# Security audit report: Bass Note Piano (run 1)

## 1. Run scope and limits
- **Profile:** quick. This is a **partial pass**, not a claim that the rest of the app is clean.
- **Scope:** whole repository, source ref `97fda9f6` (branch bar-title-consistency, 4 UI files modified on disk).
- **Execution:** source only. No target code was run: no verified OS sandbox (no network, empty environment, read-only target, resource limits) exists on this host. `.env*` files were never read.
- **Budget:** none set. Agents used: 4 recon, 9 hunters, 1 coverage critic, 8 verifiers (22 total).
- **Prior runs:** none.
- **Coverage ledger:** 17 units: 3 covered, 6 with candidate leads, 0 blocked, 8 deferred. The 8 deferred units come from the coverage critic and were not hunted because the quick profile allows exactly one hunter wave. Part of that ground was in fact touched by the main hunters (scholarships, friends/messages, Discord OAuth), but the critic named it as lacking a dedicated unit.
- **Critic note:** it asked to "reassign h9", which is an agent name and not a coverage ID, so I did not act on it.

## 2. Posture summary
No confirmed vulnerabilities, because confirmation requires running code. The source shows careful work: every admin server action checks the admin or owner role first (checked across all admin action files), sign-in always passes through one gate with code-guess limits, lockout and admin two-step, the parent/child link and receipts are properly scoped, exports are formula-safe, webhooks use signature checks with timing-safe compares, and no secrets are committed. Eight leads need checking. The one I would look at first is the payment-email parser.

## 3. Confirmed findings
None.

## 4. Needs validation (leads, no severity, none confirmed)
| # | Lead | Boundary | Blocker |
|---|------|----------|---------|
| 1 | Payer-controlled note can spoof a SoFi headline and auto-approve a full-price payment with a tiny real transfer | src/app/api/inbound/payments/route.ts | Whether the real Venmo, Zelle or BoA email body includes the payer's note as plain text in a position the regex can match (and whether the n |
| 2 | NextAuth jwt callback re-stamps a stale token's sessionVersion on trigger==='update', defeating server-side session revocation for a stolen cookie | node_modules/next-auth/core/index.js | Needs a precondition: the attacker already holds a valid, unexpired session cookie (cookie theft, shared device, XSS-free exfiltration). The |
| 3 | Avatar URL prefix check lets a signed-in user queue an R2 DeleteObject for a key outside their avatars folder via '..' segments | src/app/(dashboard)/account/actions.ts | Whether Cloudflare R2 or its edge collapses '..' in the request path is not determinable from source. If it normalizes the path before verif |
| 4 | Unauthenticated forged From can inject a VISITOR message into an existing EMAIL support thread (low impact) | src/app/api/inbound/mailgun/route.ts | Needs a live Mailgun delivery to see whether X-Mailgun-Spf and X-Mailgun-Dkim-Check-Result are prepended (Mailgun first, so first-wins is sa |
| 5 | Any ADMIN-role account can make lesson deletion delete an arbitrary object in the R2 bucket (including encrypted DB backups) | src/app/(dashboard)/admin/lessons/actions.ts | Needs R2_PUBLIC_URL set to build the public-form fileUrl. The 'private:' form would only reach the private bucket, if one is configured, not |
| 6 | Client-supplied occurrenceDateMs is never normalized, so exact-timestamp slot, owner-reservation and one-per-day checks can be bypassed | src/app/(dashboard)/lessons/actions.ts | Other checks may still stop the attack, so the exploit is unproven. These are rate limits, the credit balance, the weekly subscriber limit ( |
| 7 | Family class booking books other students' accounts with no consent or relationship check | src/app/(dashboard)/lessons/actions.ts | booking.allowFamily may be off in production, which disables the whole path. |
| 8 | Teacher calendar feed does not escape a bare CR in student names (possible iCalendar property injection) | src/app/api/auth/register/route.ts | No local run is possible, so no calendar client's handling of a bare CR was observed. |

Full traces, blockers and safe check plans: NEEDS-VALIDATION.md.

## 5. Hardening notes (not findings)
- CI: ci.yml has no top-level permissions block; its build step reads secrets.DATABASE_URL and npm run build runs prisma migrate deploy, so if that secret ever holds the production URL a PR branch could migrate production. Use only the CI service Postgres. Pin actions to commit SHAs.
- db-backup.yml (GitHub Actions) is a second production-dump path next to the in-app nightly db-backup; retire it if unused. Backups live under predictable names in the public bucket (ciphertext only; safe as long as BACKUP_ENCRYPTION_KEY stays secret). A private backup bucket would be cheap defense in depth.
- scripts/seed-revamp-test.mjs hardcodes a password and creates an ADMIN; its local-database guard is a loose regex on the URL.
- Admin policy: employee admins cannot refund or edit prices, but can approve payments, add unlimited credits, grant free access and book with any credits; any admin can force-sign-out the owner. Decide whether that is intended.
- Sign-in-adjacent: email, reset and change codes have no cumulative failure lockout across codes; a stranger can pre-register your email with their own password (pre-hijack); a revoked session survives while the database is slow; the edge middleware trusts the JWT role for /admin for up to 7 days after demotion (pages re-check on the server); updateEmailAction does not update emailCanonical.
- Atom: /api/assistant/suggestions ignores the atom.enabled kill switch and has no daily cap; the support reply route keys its rate limit on the first x-forwarded-for entry; the typing route skips the thread ownership check; escalation transcripts accept forged ATOM turns.
- Teacher calendar link is one permanent token (rotating needs NEXTAUTH_SECRET, which signs everyone out); NEXTAUTH_SECRET signs sessions, calendars, unsubscribe and recipient tags (use per-purpose keys); csp-report rows can be filled by anyone to hide real violations; confirm /.netlify/functions/<name> cannot be triggered over HTTP on the live site.
- Student side: a child under parent control can still pause, change term and cancel a solo plan through account actions; checkPaymentPhone is an unrated phone-number oracle; payment note and sender name have no length cap; bookClassBundle has no length cap; data export omits support threads, mail, practice, Atom chats and friend data.
- Push and Discord: notification click URLs would accept //host if one ever reached them; Discord state is not single-use on the server.
- Untracked "... 2.ts" duplicate files exist on your disk only (git ignores them); delete them so a manual deploy from the working folder cannot ship stale code. Positive: lockfile has integrity hashes everywhere, no typosquats, strict CSP built (still report-only), PDF watermarking fails closed.

## 6. Coverage and what this run does NOT cover
Hunted: inbound payments, sign-in and sessions, admin actions, student/parent/billing/lessons/friends/account actions, public token endpoints and webhooks, files/exports/backups, Atom and support, headers/service worker/push/Discord OAuth, dependencies and CI.
Deferred (not hunted): netlify/functions/attendance-auto-charge.ts; prisma/schema.prisma; src/app/api/consent; src/app/onboarding/actions.ts; src/lib/discordApi.ts; src/lib/reportError.ts; src/lib/sms.ts; src/lib/social.ts.
The final-clean critic loop of the standard profile was not run. A standard or deep run, or a sandboxed re-run to confirm the leads, would extend this.
