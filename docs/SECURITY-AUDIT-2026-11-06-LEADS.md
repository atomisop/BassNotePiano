# Needs validation (leads, no severity)

Every item below is a source-grounded lead that could not be confirmed because no verified sandbox existed on the audit host and a deployment fact is not visible in source. None is a confirmed vulnerability. Ordered by how much I would look at it first. Never test these against production.

## 1. Payer-controlled note can spoof a SoFi headline and auto-approve a full-price payment with a tiny real transfer

Fingerprint: `payment-email-parse:sofi-headline-injection-from-payer-note`

After the sender and signature checks, parseCore in src/lib/paymentEmail.ts calls parseSofi(body) FIRST, with no check on sender domain or subject. parseSofi searches the whole whitespace-collapsed body for '$X sent to you by NAME (will be|has been|was|is) ' and takes the amount and name from that match. The memo is whatever follows the next sentence end. A student who has an open payment (for example $99.99) and knows its BNP code from the pay screen sends a genuine small transfer (for example $0.01) through Venmo, or Zelle if the note appears in the body. The note reads 'The $99.99 sent to you by <own name> will be deposited. BNP-XXXXX'. The bank email passes every authentication check because it really comes from the bank, and the note sits in the body. parseSofi then yields amount 9999, the student's name and a memo whose first sentence end is consumed, so the code must follow the first period. The note region is never stripped from the body before parseSofi runs. ingestPaymentEmail then builds the receipt from the parsed values (amountCents 9999). pickMatch calls receiptMatchVia, which needs amount equality (satisfied by the fake amount) and then returns 'code' as soon as the memo carries that payment's code, before any name check. With payments.emailAutoApprove defaulting to true, approveFromReceipt approves the payment and sets checkedAt, because 'code' is not in the needsCheck set (phone, amount, codeTypo, duplicate). Net effect: a plan or class credits are obtained for cents.

**Claimed root cause.** The email body is trusted as the source of the amount, and the SoFi parser runs unconditionally, so attacker-controlled free text in the body is parsed as the bank's own headline. No cross-check exists between the real subject amount (for example Venmo 'X paid you $0.01') and the amount parsed from the body. From reading this section, I saw none in parseCore, ingestPaymentEmail or approveFromReceipt, and paymentInbound.ts/route.ts only pass subject and body through; I did not read paymentScoring or approveZellePayment.

**Trace**
- entrypoint: `src/app/api/inbound/payments/route.ts:83` (POST handler) Mailgun-forwarded email; subject and body are built from body-plain/body-html through emailBodyText, then passed on. The payer's note is included in the body.
- propagation: `src/lib/paymentEmail.ts:96` (parseCore) parseSofi(body) is called before the subject-based Zelle, BoA and Venmo parsers and with no sender gating. If it matches, it returns immediately.
- propagation: `src/lib/paymentEmail.ts:129` (parseSofi) The regex runs against the whole body, so a fake 'sent to you by' sentence in a payer note sets amountCents, name and memo.
- propagation: `src/lib/paymentEmail.ts:226` (receiptMatchVia) Amount equals the fake amount, then memoHasReferenceFor returns 'code' without requiring the sender name to match the account.
- sink: `src/lib/paymentEmail.ts:530` (ingestPaymentEmail) With payments.emailAutoApprove (default true, siteSettingsDefs.ts:123) the payment is auto-approved via approveFromReceipt (line 287), and checkedAt is set because via is 'code'.

**Evidence**
- `src/lib/paymentEmail.ts:96` I re-read parseCore, parseSofi, venmoNote, receiptMatchVia, pickMatch, ingestPaymentEmail and approveFromReceipt. Parser order, the missing sender gating and the code-before-name matching are all as the candidate claims.
- `tests/paymentMatching.test.ts:1` Existing tests (paymentMatching, db/paymentEmail, db/inboundPayments) only use genuine SoFi bodies. I found no test that rejects a headline injected inside a note, and no amount cross-check against the subject.

**Blockers**
- Whether the real Venmo, Zelle or BoA email body includes the payer's note as plain text in a position the regex can match (and whether the note is HTML-escaped or truncated) is unverified.
- The note needs a period after the fake sentence so the BNP code falls in the memo region. Venmo and Zelle note length limits and character filtering are unverified.
- The 6000-character body cap and the exact text of real Venmo notification emails could change the result.
- Some real SoFi disclaimers may sit before the memo in genuine mail, but this does not matter for a spoofed Venmo email.
- Impact is bounded to the student's own open payment: the amount must equal an existing open payment, and the student must know the code (shown on the pay screen). Venmo, where the headline is in the subject, is the most plausible vector.
- The owner's receipt record would show the fake amount ($99.99) and a 'code' match with checkedAt set, so only a bank-balance reconciliation would reveal the gap. The Money check does not obviously compare bank deposits.

**Local check (needs a sandboxed dummy-data run)**
Unit-level only, no network: call parsePaymentEmail with subject 'Jordan Alemu paid you $0.01' and a body whose note is 'The $99.99 sent to you by Jordan Alemu will be deposited. BNP-ABCDE'. Confirm it returns amountCents 9999 and a memo containing the code, then run receiptMatchVia against a mock open payment of 9999 whose id ends in the same code. In tests/db, extend the paymentEmail ingest test to show the payment approves with checkedAt set and matchedVia 'code'.

**Owner-observed deployment check (staging only)**
On staging (APP_ENV=staging) with a test student and a Venmo or Zelle sandbox, or the signed-test-email script scripts/send-test-bank-email.mjs, send a $0.01 transfer carrying the crafted note. Verify with a real Venmo email that the note appears in the forwarded body and that the payment auto-approves. Do not test against production.

## 2. NextAuth jwt callback re-stamps a stale token's sessionVersion on trigger==='update', defeating server-side session revocation for a stolen cookie

Fingerprint: `auth.jwt-update-trigger-rebakes-sessionVersion`

The jwt callback in src/lib/auth.ts only compares token.sessionVersion to the DB value in an else-if branch. When trigger==='update' (or user is set), it overwrites token.sessionVersion with the current DB value and skips the comparison. next-auth 4.24.15 lets any caller with the session cookie and a self-obtained CSRF double-submit pair POST /api/auth/session. That path decodes the cookie (signature and expiry only) and calls callbacks.jwt with trigger 'update'. The stale token is therefore re-stamped with the new sessionVersion and re-issued with a fresh maxAge. A stolen cookie from before a password change, 'sign out other devices', or a demotion stays valid, which contradicts the documented control in CLAUDE.md that changing a password signs out other devices.

**Claimed root cause.** The update-trigger branch in the jwt callback trusts the presented token and never checks its sessionVersion against the DB. The branch exists so the device that triggered the bump does not sign itself out, but it cannot tell that device apart from any other holder of an old token.

**Trace**
- entrypoint: `node_modules/next-auth/core/index.js:304` (case 'session') A POST to /api/auth/session with options.csrfTokenVerified calls routes.session with isUpdate:true and newSession=req.body.data. Only CSRF is checked here; there is no other authentication besides the cookie.
- propagation: `node_modules/next-auth/core/index.js:117` (init) csrfTokenVerified is true when the body csrfToken matches the csrf cookie and its hash. The attacker gets a matching pair from GET /api/auth/csrf on their own client. The CSRF cookie is not tied to the victim session, so this does not stop a cookie holder.
- propagation: `node_modules/next-auth/core/routes/session.js:38` (session()) jwt.decode only verifies signature and expiry. A token with a stale sessionVersion decodes fine. callbacks.jwt is then called with trigger:'update', and the result is re-encoded with a fresh maxAge and set as the session cookie.
- propagation: `src/lib/auth.ts:277` (jwt callback) if (user || trigger === 'update') { token.sessionVersion = entitlements.sessionVersion } rebakes the current DB version. The mismatch check at ~289, which returns {}, is an else-if branch and is not reached on update.
- propagation: `src/app/api/auth/[...nextauth]/route.ts:1` (route handler) NextAuth(authOptions) is exported as both GET and POST with no wrapper restricting /api/auth/session. A grep of middleware files for 'api/auth' found nothing.
- sink: `src/lib/auth.ts:370` (getServerAuthSession (sink)) After the re-stamp, getServerAuthSession sees a valid session.user.id. Only bannedAt, paymentLockedAt and isDeviceSignedOut still block it.

**Evidence**
- `src/lib/auth.ts:277` I read these locations and the code matches the claim. (1) Conditions: POST to /api/auth/session, options.csrfTokenVerified true, and a decodable session cookie. newSession is req.body.data. (2) The loaded entitlements are used on update; the version-compare is in the else-if chain after the update branch, and no earlier check exists. The only thing before it is the DB-unreachable fallback (tokenWhenEntitlementsUnknown). (3) The legitimate re-stamp comment in auth.ts says the device that just bumped the version calls update() so it does not sign itself out. That is the intended reason, but it is an unauthenticated-by-version path. (4) jwt.decode in session.js does not look at sessionVersion. (5) The ban and payment-lock checks in getServerAuthSession remain, as does the per-device sign-out (isDeviceSignedOut, which matches the user agent only). (6) next-auth version is 4.24.15.

**Blockers**
- Needs a precondition: the attacker already holds a valid, unexpired session cookie (cookie theft, shared device, XSS-free exfiltration). The bug does not give initial access.
- The stale cookie must still be inside its JWT maxAge when the update is posted.
- Banned, payment-locked and device-signed-out (UA-matched) accounts are still refused by getServerAuthSession even after the re-stamp.
- I could not run anything, so I have not confirmed that next-auth's CSRF cookie flow works for a client that only has the session cookie. By the code it should, because the CSRF pair is self-issued by GET /api/auth/csrf.
- I did not read the repo-root middleware in full, only grepped it for 'api/auth'. Check that it has no matcher or rule that blocks POST /api/auth/session.

**Local check (needs a sandboxed dummy-data run)**
Create a test user, then sign in as session A and save its cookie. Call the change-password action (or signOutOtherDevicesAction) in session B to bump User.sessionVersion. Confirm A's cookie now gets {} / logged out on a normal request. Then replay a fresh sign-in as A, bump again, and before using A's cookie do: GET /api/auth/csrf to collect the csrf cookie and token, then POST /api/auth/session with A's session cookie, the csrf cookie, and body csrfToken=<token>&json=true (data optional). Check whether the response sets a new session cookie carrying the new sessionVersion. Then use that new cookie against a page that calls getServerAuthSession and see whether it is authenticated. Also test a demoted admin, and the same flow with the cookie expired.

**Owner-observed deployment check (staging only)**
Same replay against a staging deploy (APP_ENV=staging) with throwaway test accounts only. Never run it on production accounts. Fix to test: gate the update branch with a comparison, for example keep the else-if mismatch check ahead of the update re-stamp, and have the client that triggers the bump receive a freshly issued token server-side (set token.sessionVersion in the same action that bumps it). Then confirm the legitimate password-change device stays signed in and the old cookie is dropped.

## 3. Avatar URL prefix check lets a signed-in user queue an R2 DeleteObject for a key outside their avatars folder via '..' segments

Fingerprint: `storage.avatar-key-prefix-dotsegment-delete`

updateAvatarAction accepts a client-supplied publicUrl and only checks that the key derived from it starts with avatars/<ownId>/. The raw string is stored in User.image. On the next avatar change, or on account deletion, the same string is turned back into a key and passed to DeleteObjectCommand against R2_BUCKET_NAME. That bucket also holds backups/ (encrypted nightly DB dumps) and, until the private bucket is configured, public-URL lesson files. A key such as avatars/<id>/../backups/<file> passes the prefix check, and nothing in source rejects or normalizes '..'. Whether R2 collapses the dot segment is not visible in source.

**Claimed root cause.** Authorization is a string startsWith on an unnormalized, client-controlled key. keyFromPublicUrl only strips the R2_PUBLIC_URL prefix. deleteObject trusts the key and does no re-derivation, no '..' rejection and no check that the key came from createPresignedAvatarUpload.

**Trace**
- entrypoint: `src/app/(dashboard)/account/actions.ts:295` (updateAvatarAction(publicUrl)) Server action reachable by any signed-in user (requireSession). publicUrl is attacker-controlled.
- propagation: `src/lib/storage.ts:263` (keyFromPublicUrl) Checks startsWith(R2_PUBLIC_URL + '/') and slices the rest. There is no new URL() parse, so dot segments are not normalized, and no '..' check.
- propagation: `src/app/(dashboard)/account/actions.ts:301` (updateAvatarAction prefix check) Only requires key.startsWith('avatars/<id>/'). The key avatars/<id>/../backups/x passes. The raw publicUrl is then saved to User.image (line ~307).
- propagation: `src/app/(dashboard)/account/actions.ts:311` (updateAvatarAction cleanup, and deleteAccount at ~502) On the next avatar change the stored previous image is passed through keyFromPublicUrl again (no prefix re-check). Account deletion does the same at line 502.
- sink: `src/lib/storage.ts:254` (deleteObject) Sends DeleteObjectCommand({Bucket: R2_BUCKET_NAME, Key: key}) with the literal key. Errors are swallowed.

**Evidence**
- `src/lib/storage.ts:263` keyFromPublicUrl does no normalization or validation beyond the base prefix. There is no URL parsing anywhere in the path.
- `src/app/(dashboard)/account/actions.ts:302` The only authorization is the avatars/<id>/ prefix on the unnormalized key. deleteObject and the cleanup at line 311 re-derive the key without re-checking the prefix.
- `node_modules/@smithy/signature-v4/dist-cjs/index.js:256` getCanonicalPath collapses '.' and '..' only when uriEscapePath is true. That is the non-S3 behavior, and the S3 client sets it false. So the SDK likely signs and sends the literal '..' path, with no client-side normalization (inferred; the S3 flag was not traced). Node's HTTP handler does not normalize paths either.
- `src/lib/storage.ts:45` S3Client is built with the R2 account endpoint and default path-style addressing, so the key goes into the request path as /<bucket>/avatars/<id>/../backups/<file>.
- `src/lib/storage.ts:238` Legitimate avatars are keyed avatars/<userId>/<timestamp>-<safeName>, so no legitimate flow produces '..'.

**Blockers**
- Whether Cloudflare R2 or its edge collapses '..' in the request path is not determinable from source. If it normalizes the path before verifying the SigV4 signature, the signature will not match the literal path and the request fails with 403. If it treats '..' as a literal key segment, the delete targets a nonexistent key and is a no-op. Only if R2 resolves the segment after signature verification does the delete hit backups/.
- The cross-folder delete needs the target key to be guessable. Backup keys are date-based (backups/<date>.json.enc), so the exact name is likely guessable, but this was not confirmed from src/lib/backupCore.ts in this check.
- deleteObject swallows errors, so a failed attempt is silent. Impact is availability and integrity only (backups are encrypted, lessons are not disclosed). Whether backups sit in a separate bucket depends on the R2_BUCKET_NAME deployment config, which was not read.
- Exploit cost is low once the prefix passes: any signed-in student can call the server action and then trigger the delete by changing avatar again or deleting their own account.

**Local check (needs a sandboxed dummy-data run)**
Use a throwaway MinIO or localstack S3 and a local R2_PUBLIC_URL. Sign in as a test user and call updateAvatarAction with `${R2_PUBLIC_URL}/avatars/<id>/../victim.txt`. Call it again with a normal avatar URL, or delete the test account. Check whether victim.txt is deleted (MinIO collapses dot segments differently from R2, so this only validates the application logic and the SDK request path). Also capture the outgoing HTTP request path from the S3 client to confirm '..' is sent literally.

**Owner-observed deployment check (staging only)**
On a staging R2 bucket (never production backups), put a canary object at canary/x.txt, set the test user's image to `<R2_PUBLIC_URL>/avatars/<id>/../canary/x.txt` via updateAvatarAction, trigger deletion by changing the avatar, then check whether the canary still exists. A deleted canary confirms R2 resolves the segment. A 403 or an intact canary rejects the finding for R2. Regardless, the cheap fix is to reject '..', '.' and empty segments, or to re-validate the prefix inside deleteObject callers.

## 4. Unauthenticated forged From can inject a VISITOR message into an existing EMAIL support thread (low impact)

Fingerprint: `support-inbound-email-from-header-trust`

ingestInboundEmail joins an existing EMAIL thread without requiring senderVerified. The fallback matches only on contactEmail == forged From and the same normalized subject. A forged-From mail from anyone who can reach the Mailgun route then appends a VISITOR message to that person's thread, reopens it if resolved, and notifies admins. The thread-id (In-Reply-To) path needs a known Message-ID and is harder to hit. The account-linking part of the claim (senderVerified bypass through a duplicated X-Mailgun header) is unproven and cannot be settled from source.

**Claimed root cause.** Thread joining (support.ts ~645-672) never checks senderVerified, and there is no per-thread token in the subject or reply address. The fallback proof is only the spoofable From plus the subject. Separately, isSenderAuthenticated reads headers via parseMessageHeaders, which keeps the first occurrence of a duplicated header name. 'pass' is also not checked for alignment with the From domain.

**Trace**
- entrypoint: `src/app/api/inbound/mailgun/route.ts:30` (POST) Mailgun-signed form post. sender comes from the from field. headers come from message-headers JSON. senderVerified = isSenderAuthenticated(headers).
- propagation: `src/lib/inboundEmail.ts:46` (parseMessageHeaders / isSenderAuthenticated) The first occurrence of a header name wins. x-mailgun-dkim-check-result or x-mailgun-spf equal to 'pass' sets verified. There is no alignment check with the From domain.
- propagation: `src/lib/support.ts:659` (ingestInboundEmail fallback thread match) Finds EMAIL threads where contactEmail == mail.fromEmail and the normalized subject matches. senderVerified is not consulted.
- sink: `src/lib/support.ts:680` (ingestInboundEmail append branch) Creates a VISITOR SupportMessage in the victim's thread, reopens it if RESOLVED, and notifies admins when the previous sender was not VISITOR.

**Evidence**
- `src/lib/support.ts:694` The new-thread branch links to a User only when senderVerified, which shows the author knew From is forgeable. The append branch has no such guard.
- `src/lib/support.ts:485` Admin replies go to the stored escalation.contactEmail (fixed when the thread was created). An attacker cannot redirect replies, only add forged text from the victim to the thread.
- `src/app/api/inbound/mailgun/route.ts:87` Mailgun signature and recipient checks gate the route. Per-sender limit is 20 an hour. Auto-replies and bounces are dropped. Nothing is auto-executed from message content.
- `tests/inboundEmail.test.ts:101` Tests cover only the pass/fail truth table of isSenderAuthenticated. They show no intent that appends must be verified, and no test of duplicate or spoofed headers.

**Blockers**
- Needs a live Mailgun delivery to see whether X-Mailgun-Spf and X-Mailgun-Dkim-Check-Result are prepended (Mailgun first, so first-wins is safe) or appended after sender-supplied headers. Mail also arrives via a Squarespace forward to inbox.bassnotepiano.com, so what Mailgun is actually checking (the forwarder's SPF) is unknown.
- Attacker needs an existing EMAIL thread's contact address plus its normalized subject, or a known Message-ID. A From domain with a strict DMARC policy may be rejected upstream by Squarespace/Google before it reaches Mailgun.
- Impact is bounded. Admins see forged text attributed to the victim and could be socially engineered, but replies always go to the original contactEmail. Nothing is executed or auto-approved, and new unverified threads are not linked to accounts. Confirm the admin UI really shows no unverified indicator (SupportChatPanel was not found at the path cited; the component was not inspected).

**Local check (needs a sandboxed dummy-data run)**
Unit-test parseMessageHeaders and isSenderAuthenticated with a duplicated x-mailgun-spf header pair in both orders. Then run tests/db-style ingestInboundEmail: create an EMAIL thread for victim@x.com, then ingest a mail with fromEmail=victim@x.com, senderVerified=false, the same subject, and expect outcome 'appended' (confirms no verification is required). Also confirm a new unverified thread gets userId null.

**Owner-observed deployment check (staging only)**
On staging with a Mailgun route, send a message to music@inbox with a forged From matching an existing thread and a sender-supplied 'X-Mailgun-Spf: pass' header. Inspect the posted message-headers order and whether the thread was appended. Confirm the admin Email tab shows no unverified marker.

## 5. Any ADMIN-role account can make lesson deletion delete an arbitrary object in the R2 bucket (including encrypted DB backups)

Fingerprint: `courseContent.lesson-fileurl-arbitrary-key-delete-nonowner-admin`

createLessonAction accepts a caller-supplied fileUrl and stores it unchanged. resolveLessonFile accepts any 'private:<key>' or '<R2_PUBLIC_URL>/<key>' value with no 'lessons/' prefix or shape check. deleteLesson then calls deleteLessonFile, which runs DeleteObject on that bucket and key. The nightly backups (backups/YYYY-MM-DD.json.enc) and avatars live in the same public bucket (R2_BUCKET_NAME) that the public-URL form maps to. A non-owner admin (employee) could create a lesson whose fileUrl is '<R2_PUBLIC_URL>/backups/<date>.json.enc' and then delete the lesson to destroy that backup. Repeating this for each dated key would remove the backups the owner relies on, and the same trick deletes avatars. The read path /api/lessons/[id]/file would serve any object in the lesson bucket to students with access, but backups are encrypted and the bucket is already public, so the read side adds little. The real impact is integrity and availability of owner-controlled assets.

**Claimed root cause.** There is no validation of the key prefix or the fileUrl format on the write path (createLessonAction -> createLesson), and no check at the delete sink. The admin gate is requireAdmin, which only tests role === 'ADMIN'. The owner is distinguished only by isOwnerEmail, so employees with the ADMIN role have the same access.

**Trace**
- entrypoint: `src/app/(dashboard)/admin/lessons/actions.ts:44` (createLessonAction) A server action gated only by requireAdmin (session.user.role === 'ADMIN'). It passes input.fileUrl straight into createLesson with no validation.
- propagation: `src/lib/courseContent.ts:78` (createLesson) Persists fileUrl verbatim in prisma.lesson.create. There is no prefix or format check.
- propagation: `src/app/(dashboard)/admin/lessons/actions.ts:53` (deleteLessonAction) A requireAdmin-gated action that calls deleteLesson(lessonId).
- propagation: `src/lib/storage.ts:88` (resolveLessonFile / keyFromPublicUrl) Maps 'private:<key>' (bucket = lessonBucketName()) or '<R2_PUBLIC_URL>/<key>' (bucket = R2_BUCKET_NAME) to {bucket, key}. The key is any string, with no lessons/ prefix requirement.
- sink: `src/lib/storage.ts:117` (deleteLessonFile) DeleteObjectCommand on the resolved bucket and key. Errors are swallowed. Because deleteLesson awaits this unconditionally after the DB row is deleted, the object is always deleted when R2 credentials allow it.

**Evidence**
- `src/lib/courseContent.ts:117` deleteLesson deletes the row and then calls deleteLessonFile(lesson.fileUrl) unconditionally. There is no ownership or prefix guard.
- `src/lib/storage.ts:283` Backups are written to process.env.R2_BUCKET_NAME under backups/YYYY-MM-DD.json.enc. This is the same bucket that the public-URL form of resolveLessonFile targets, so the key is reachable from a lesson fileUrl.
- `src/app/(dashboard)/admin/employees/actions.ts:24` Owner-only operations are separated by isOwnerEmail. Non-owner ADMIN accounts (employees) are a first-class concept, and requireAdmin in the lessons actions does not distinguish them.

**Blockers**
- Needs R2_PUBLIC_URL set to build the public-form fileUrl. The 'private:' form would only reach the private bucket, if one is configured, not the public bucket holding backups.
- Attacker must already be a non-owner ADMIN. Employees can already do much damage to the studio (payments, plans, bans), so the new boundary crossed is limited to deleting storage objects outside lessons/, mainly backups and avatars. Whether this crosses a real boundary depends on how much the owner trusts employees.
- Backups are encrypted, so the read path leaks nothing useful from them. Everything else in the public bucket is already publicly readable.
- Backup retention (a nightly job keeps multiple dated copies) means destroying all of them needs a deliberate sequence of dated keys, and the next nightly run recreates today's backup.
- I did not find a code path that validates the key, but I did not check the client form or whether the R2 credentials are scoped down (for example with a bucket policy denying deletes under backups/).

**Local check (needs a sandboxed dummy-data run)**
With a local DB and a mock S3 (for example MinIO) set as R2_BUCKET_NAME and R2_PUBLIC_URL, put an object at backups/2026-01-01.json.enc. As a non-owner ADMIN session, call createLessonAction with fileUrl '<R2_PUBLIC_URL>/backups/2026-01-01.json.enc', then deleteLessonAction on the new lesson. Confirm the object is gone. Also confirm a student with access can GET /api/lessons/<id>/file for a non-lesson key. Run this against the real functions in a test file under tests/db/ rather than against the production database.

**Owner-observed deployment check (staging only)**
Do not run against production. On staging (APP_ENV=staging) with a throwaway bucket, repeat the same flow using an employee-role admin account, and check the R2 token's permissions to see whether delete on backups/ is blocked at the storage level.

## 6. Client-supplied occurrenceDateMs is never normalized, so exact-timestamp slot, owner-reservation and one-per-day checks can be bypassed

Fingerprint: `bnp:booking:unvalidated-occurrence-date-bypasses-slot-owner-and-day-checks`

bookClassAction passes a client number straight into bookClass. bookClass builds scheduledAt from only the UTC year, month and day of new Date(ms), but every conflict check keys on the raw occurrenceDate timestamp. A caller who sends the true occurrence midnight plus 1 ms (or any ms within that UTC day) gets the same scheduledAt but a different occurrenceDate. The slot-taken check, the owner-reservation / Close-a-day check, the same-day check and the unique key all miss the existing row. Also, no check ties the date to schedule.dayOfWeek or to getUpcomingOccurrences, so the schedule's start time can be booked on any future date.

**Claimed root cause.** occurrenceDate is derived from the untrusted number with no startOfUtcDay normalization, no dayOfWeek check and no membership check against real occurrences. Conflict detection relies on exact equality of that timestamp, and no unique index or overlap check exists on (scheduleId, scheduledAt) for weekly (non-one-off) schedules.

**Trace**
- entrypoint: `src/app/(dashboard)/lessons/actions.ts:26` (bookClassAction) Server action takes occurrenceDateMs from the client. It checks only the session and parent control, then calls bookClass(session.user.id, scheduleId, occurrenceDateMs, ...) with no validation.
- propagation: `src/lib/classSchedule.ts:615` (bookClass) const occurrenceDate = new Date(occurrenceDateMs). The value is not rounded to the UTC day, and its weekday is not compared to schedule.dayOfWeek.
- propagation: `src/lib/classSchedule.ts:616` (bookClass) scheduledAt is computed from only getUTCFullYear, getUTCMonth and getUTCDate of that value, plus the ET start time and chunk offset. Any ms within the same UTC day therefore gives the identical scheduledAt.
- propagation: `src/lib/classSchedule.ts:655` (bookClass (transaction)) takenByAnyone = findFirst({ scheduleId, occurrenceDate, scheduledAt, status: SCHEDULED }). It is an AND on the exact occurrenceDate with no OR on scheduledAt alone, so a row stored with the true midnight is not matched by midnight+1ms.
- propagation: `src/lib/classSchedule.ts:311` (oneOffOverlap) The scheduledAt-window overlap check applies only to bookings whose schedule label is ONE_OFF_LABEL, so it does not cover regular weekly schedules.
- propagation: `src/lib/ownerReservations.ts:40` (findOwnerReservation) ownerReservation.findMany({ where: { scheduleId, occurrenceDate, ... } }) is an exact-timestamp equality. It misses an owner reservation or a Close-a-day entry (stored at true midnight) when the date is shifted by 1 ms.
- propagation: `src/lib/classSchedule.ts:520` (assertNoOtherBookingSameDay) The one-class-a-day check matches occurrenceDate exactly, so the shifted value evades it. The weekly-limit check uses a gte/lt range and still applies.
- sink: `prisma/schema.prisma:1785` (ClassBooking @@unique) The unique key is (studentId, scheduleId, occurrenceDate). A shifted occurrenceDate creates a new row. Nothing is unique on (scheduleId, scheduledAt).

**Evidence**
- `src/lib/classSchedule.ts:655` Read the cited code directly. bookClass has no normalization or weekday check before using occurrenceDate. takenByAnyone is an AND of scheduleId, occurrenceDate, scheduledAt and status, with no scheduledAt-only OR. findOwnerReservation compares occurrenceDate by exact equality. The reservedByOtherPlan check at ~677 uses scheduleId and chunkIndex only, so it still blocks slots held by another student's live payment plan. That guard is unaffected by the bypass. Everything else the candidate lists matches the source. I did not confirm that rescheduleClassBookingAction and bookFamilyClassAction have the same gap, and I did not read tests/ for intent. Only the bookClass path was traced.

**Blockers**
- Other checks may still stop the attack, so the exploit is unproven. These are rate limits, the credit balance, the weekly subscriber limit (a range check, still applies), the minNotice setting and a possible UI-level guard.
- The attacker's booked row would carry a non-midnight occurrenceDate, so the admin roster, getUpcomingOccurrences and cancel/refund code may behave oddly. This could limit practical impact or make it noisier.
- The reservedByOtherPlan guard still protects slots held by active payment plans. The impact is limited to ad-hoc slots already booked by one-off students, owner reservations and closed days.
- The reschedule and family paths were not traced. They may normalize or validate the date differently.

**Local check (needs a sandboxed dummy-data run)**
With a throwaway local Postgres and the tests/db harness: (1) have student A book a real weekly occurrence (occurrenceDate at midnight UTC) via bookClass, then call bookClass for student B with the same ms + 1 and confirm a second SCHEDULED row exists with an identical scheduledAt. (2) Create an OwnerReservation or a Close-a-day entry for a date and confirm bookClass(ms+1) succeeds where bookClass(ms) throws OWNER_RESERVED_MESSAGE. (3) Call bookClass with a date whose weekday differs from schedule.dayOfWeek and confirm it is accepted. (4) Repeat for rescheduleClassBooking and bookFamilyClass.

**Owner-observed deployment check (staging only)**
On a staging deploy with test accounts, call the bookClassAction server action with a hand-built request carrying occurrenceDateMs + 1 for a slot that is booked or reserved. Check whether it returns ok with two bookings on the same scheduledAt. Do not test against production.

## 7. Family class booking books other students' accounts with no consent or relationship check

Fingerprint: `bnp:booking:family-class-books-other-accounts-without-consent`

Any signed-in student can call bookFamilyClassAction with 2+ emails of other verified accounts. bookFamilyClass resolves them by email and checks only these things: email verified, no ACTIVE payment plan, at least FAMILY_CREDITS_PER_STUDENT free credits, no same-day class, and the slot is free. It then creates SCHEDULED ClassBooking rows under each named account. Nothing requires the initiator to be an attendee. There is no invite/accept step, no friend/household/parent relationship check and no admin approval. This differs from group plans (FamilyInvite) and parent mode (ParentLink), which both require the other person to accept. Effect on a victim: part of their credit balance (creditsSpent counts as pending in later availability checks) is held and their day is blocked, and they are sent a booking-confirmed notice. Credits are only reserved, not debited. The debit happens in markAttendance, or when attendanceAutoCharge charges a class left unmarked after attendance.autoChargeHours. The victim can cancel free of charge via cancelClassBookingAction until cancel.cutoffHours before the class (the cancel path says 'No credits were charged'). So the realistic impact is harassment, credit lock and slot hogging, plus possible loss only if the victim ignores the notice past the cutoff and the studio marks or auto-charges the class. Two aggravating points: (1) the victim's own parent-control lock blocks cancelClassBookingAction (hasParentControl), yet bookFamilyClass never checks parent control for attendees, so a linked child could be booked and could not cancel themselves; (2) checkFamilyClassAttendeesAction returns found/name/verified for any email (30 checks per 10 min), an account-enumeration oracle. The code comments say this is intentional (family members book each other), and booking.allowFamily is a toggle.

**Claimed root cause.** bookFamilyClass treats a typed email as authorization to create bookings and credit holds on a third party's account. The only attendee-side guards are verified email, no active plan and enough free credits. There is no consent, invite or relationship check, and no parent-control check for attendees.

**Trace**
- entrypoint: `src/app/(dashboard)/lessons/actions.ts:62` (bookFamilyClassAction) Server action for any signed-in user. It checks only the initiator's own parent control, then forwards the client-supplied attendeeEmails to bookFamilyClass.
- propagation: `src/lib/classSchedule.ts:1054` (bookFamilyClass) Applies booking.allowFamily and notice rules, rate-limits the initiator, and resolves attendees by email. It requires emailVerified and rejects attendees with ACTIVE payment plans. Neither the initiator being one of the attendees nor any relationship is required.
- propagation: `src/lib/classSchedule.ts:1528` (cancelClassBooking) The mitigation: the victim may cancel their own booking until cancel.cutoffHours, with no charge (credits were never debited). The server action refuses it when the victim has parent control.
- propagation: `src/lib/attendanceAutoCharge.ts:16` (runAttendanceAutoCharge) Any booking still SCHEDULED and unmarked after attendance.autoChargeHours is marked PRESENT and charged, so an uncanceled forced booking can eventually debit the victim.
- propagation: `src/lib/classSchedule.ts:973` (checkFamilyClassAttendees) Returns found, name and verified for arbitrary emails to any signed-in user, limited to 30 per 10 minutes. This is an account-existence and name oracle.
- sink: `src/lib/classSchedule.ts:1140` (bookFamilyClass transaction) For each named email, creates or updates a SCHEDULED ClassBooking with creditsSpent=FAMILY_CREDITS_PER_STUDENT and a shared familyBookingGroupId in the victim's account after checking free credits and the one-class-per-day rule. The victim only gets noticeBookingConfirmed; there is no accept step.

**Evidence**
- `src/lib/classSchedule.ts:1002` The doc comment says the initiator is 'not assumed to be one of the attendees' and that the only requirement is that every email resolves to a real verified account. This confirms there is no consent design.
- `src/lib/classSchedule.ts:1528` Cancel is free before the cutoff and notes that nothing was taken. This limits the harm to a credit hold and day block unless the victim is locked out of canceling or misses the cutoff.
- `src/app/(dashboard)/lessons/actions.ts:64` hasParentControl is checked only for the initiator (session user), never for the attendees.

**Blockers**
- booking.allowFamily may be off in production, which disables the whole path.
- The attacker must know a victim's verified email, and the victim must have no active plan and enough free credits (typically trial or credit-only students).
- Credits are not debited at booking, and the victim is notified and can cancel for free before the cutoff.
- A real loss needs the class to be marked or auto-charged after the victim ignores the notice.
- The behavior may be accepted product design: family members booking each other, with an admin notice sent.

**Local check (needs a sandboxed dummy-data run)**
Seed users A and B (verified, no plan, B with credits >= FAMILY_CREDITS_PER_STUDENT) and a future open slot. As A, call bookFamilyClass(A.id, ...) with [B.email, C.email] (A not included). Assert B has a SCHEDULED ClassBooking with creditsSpent set and a lower free balance, with no consent step. Then add a ParentLink for B and assert cancelClassBookingAction as B returns PARENT_CONTROL_MESSAGE while the booking persists. Cancel as B without parent control before the cutoff and assert no debit. Run runAttendanceAutoCharge on an unmarked past booking and assert B is charged. Use tests/db with a local Postgres.

**Owner-observed deployment check (staging only)**
On staging only, with two test accounts, confirm booking.allowFamily's value and the cancel.cutoffHours / cancel.studentCanCancel / attendance.autoChargeHours settings. Verify the second account sees the booking and the notice, and that its credit shown as free drops. Do not test on production accounts.

## 8. Teacher calendar feed does not escape a bare CR in student names (possible iCalendar property injection)

Fingerprint: `teacher-calendar-ics-lone-cr-injection`

The teacher ICS feed builds SUMMARY from the student's free-text account name. escapeText handles backslash, semicolon, comma and CRLF/LF, but not a lone carriage return. Registration only trims the name. A student could register a name such as 'Bob\rURL:https://evil' or one containing 'BEGIN:VALARM'. A calendar parser that treats a bare CR as a line terminator might read the text after the CR as extra properties on that VEVENT. RFC 5545 defines only CRLF as a line break, so a strict parser would keep it inside SUMMARY. Whether any real client (Apple Calendar, Google Calendar, Outlook) splits on bare CR is unconfirmed. The victim is only the owner/teacher subscribing to the token-protected feed, and the impact is limited to that calendar: a link, attachment or alarm on a class event. I could not refute the claim from source alone, but it is a low-severity, client-dependent lead.

**Claimed root cause.** escapeText in the teacher calendar route replaces /\r?\n/ only, so a standalone \r is emitted raw into SUMMARY. The name is not sanitized or length-capped upstream, and lines are joined with CRLF with no folding or control-character stripping.

**Trace**
- entrypoint: `src/app/api/auth/register/route.ts:53` (POST register) name = body.name.trim() is the only normalization. trim() strips CR only at the ends. hasFirstAndLastName (src/lib/studentName.ts) only counts words and rejects no control characters. No schema, length cap or control-character strip was found.
- propagation: `src/app/api/calendar/teacher/route.ts:29` (GET handler) Prisma selects student.name and student.email for SCHEDULED bookings in the next 120 days.
- propagation: `src/app/api/calendar/teacher/route.ts:15` (escapeText) Escapes backslash, semicolon, comma and \r?\n. A bare \r is untouched.
- sink: `src/app/api/calendar/teacher/route.ts:41` (SUMMARY line) SUMMARY:${escapeText(`Class: ${name}`)} goes into an array joined with CRLF (line 58) and is returned as text/calendar. No folding or further sanitization.

**Evidence**
- `src/app/api/calendar/teacher/route.ts:15` The regex /\r?\n/g requires a \n, so a lone CR is not matched.
- `src/app/api/calendar/teacher/route.ts:58` Plain CRLF join with no folding or control-character filtering. No shared ics helper exists in src/lib; only teacherCalendar.ts (token check) and studentName.ts (word count) are related.
- `src/app/api/auth/register/route.ts:53` Only .trim() on the name, then required-name checks. No control-character strip or length bound found.

**Blockers**
- No local run is possible, so no calendar client's handling of a bare CR was observed.
- Whether Apple Calendar, Google Calendar, Outlook or Thunderbird split on bare CR is a client fact. Strict RFC 5545 parsers should not, and many tokenize on \n only.
- The feed is secret-token protected and read only by the owner/teacher, so the only victim is the owner's own calendar.
- I did not check every name-edit path (profile update, admin edit) for sanitization. The register path has none.

**Local check (needs a sandboxed dummy-data run)**
Unit-test escapeText with 'Bob\rURL:https://x'. The output still contains a raw CR, which confirms the missing escape. Then feed the generated ICS to common parsers (ical.js, Python icalendar, Apple Calendar import) and check whether a URL or VALARM property appears on the event.

**Owner-observed deployment check (staging only)**
On a staging or local dev instance, register a student with a CR-bearing name and book a class. Subscribe a test Apple Calendar and Google Calendar to the teacher feed. Check whether the event shows an injected URL or alarm, or whether the CR is shown as text. Expected severity is low if any client splits on CR. If none does, reject, but strip CR and other control characters anyway as hardening.

