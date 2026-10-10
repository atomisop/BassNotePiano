# Systems that must agree with each other (audit of 2026-10-10)

Each row is a place where one part of the app shows or acts on something another part owns. "Worked" means a test or a live
check showed it agreeing; "Fixed" means it did not, and what changed. Tests: `tests/credits.test.ts`,
`tests/db/syncAndNotices.test.ts`, `tests/db/ban*.test.ts`, `tests/db/discordNotify.test.ts`, `tests/db/inboundPayments.test.ts`.

| # | System and what it must agree with | Result |
|---|---|---|
| 1 | Sign-in session (JWT) and the database: role, access, sessions | Worked. A ban now also refuses the next request (`getServerAuthSession`). |
| 2 | Pages the browser had already visited and the database | **Fixed.** Next reused a visited page for 30 s, so a Discord button, payment status or balance could be old. `staleTimes.dynamic = 0`. |
| 3 | Auto refresh of open pages (`AutoRefresh`) | **Fixed.** It skipped Settings and Billing entirely; now only forms in progress (plans, lessons purchase, messages, scales, profile) are skipped. |
| 4 | Credit balance, Discord link and practice status shown in several places at once | **Fixed.** One live status (`/api/me/status`, `MeStatusProvider`) feeds the top bar badge and the banners, refreshed every minute, on tab focus, on every page change and on `bnp:status-changed`. |
| 5 | Discord connect or disconnect buttons: Lessons card, Settings card, banner, admin list, class-call job | **Fixed.** The Lessons card decided "connected" from the Discord name, everything else from the id. One helper now (`discordLinkState`, by id). Every connect, disconnect and ban revalidates the whole app. |
| 6 | Admin and account actions and the screens that show their result | **Fixed.** Admin payment, plan, credit, schedule and user actions revalidated only their own page (the student page, billing, the top bar and badges kept old data). They now revalidate the whole app. Name, photo, username, instrument, tour and "what's new" seen, support-thread delete also revalidate. |
| 7 | Payment plan status and its bills | **Fixed.** Canceling a plan as an admin left its unpaid bill "awaiting transfer" forever. Self-cancel, lapse and ban already closed it. A migration closes the ones already stuck. A bill the student marked as sent (pending review) is left for the owner. |
| 8 | Payment emails: Gmail script, forwarding route, matching | Fixed earlier today: SoFi sends from `sofi.org`; both paths share the email's Message-ID so one email counts once. |
| 9 | Credits as stored (half-classes) and credits as people read them | **Fixed.** One credit is one 45 minute class. Stored balances stay in half-classes (`CREDITS_PER_CLASS`), and every number a person reads or types converts through `classCreditPricing` (`storedToCredits`, `creditsToStored`, `creditsLabelFromStored`): lessons, dashboard, admin credit tools, notices and emails. The booking, plan and refund maths is unchanged. |
| 10 | Bookings, credits, attendance, Discord calls, calendar, reminders | Worked: a booked class lasts 45 minutes everywhere; the call job, calendar feed and lists all use `CREDITS_PER_CLASS`. |
| 11 | Notifications, email and Mail inbox | **Fixed.** Events that were silent now notify (see below). |
| 12 | Bans against plans, classes, Discord, sessions, sign-in | Worked (tested). Other admins are now told of a ban or a lifted ban. |
| 13 | Site settings cache (10 s per server instance) against the jobs and pages | Worked, with a known lag of up to 10 s for a changed setting on another instance. |
| 14 | Messages, support chat, notification bell | Worked: each polls for itself. |
| 15 | Scheduled jobs and the watchdog | Worked: all 11 are watched. The Discord job now runs every minute. |
| 16 | Admin menu badges and counts | Worked with the above (refreshed by AutoRefresh and by action revalidation). |
| 17 | Each person's notification switches and what the app actually sends or shows | **Fixed (2026-10-10, second pass).** The practice banner ignored "Practice reminders" being off (and the owner's own Practice reminders switch). Both now gate it. The "Social" switch was also governing class notices and the "Role updates" switch described only admin access. New switch **Class updates** (booking, cancel, move, attendance); **Account updates** covers Discord, phone and device notices (no more always-on email); **Social** now also covers studio messages and announcements; the payments switch says plainly that a payment you are waiting on is always emailed. One shared map (`emailPreferences.ts`) decides which switch governs which notice. |
| 18 | Banned accounts and everything that emails or nudges | **Fixed.** A banned person still got practice nudges and announcement emails. Nothing is emailed to a banned account now (one check in `createNotification`, plus the announcement and practice jobs). |
| 19 | Deleting an account and Discord | **Fixed.** A deleted account stayed in your Discord server and its private class call was never removed (the class job only knows calls through bookings, which deleting the account removes). Deleting now removes the person from the server and deletes calls only they were in. |
| 20 | The phone banner and the number on the account | **Fixed.** Saving, confirming or removing a number refreshed only the Settings page; it refreshes the whole app now. |

## Events that used to be silent and now notify

- Discord connected or disconnected (by you, or by the studio): in-app and email.
- Phone number removed by the studio, or signed out of all devices (by you or the studio): in-app and email.
- A class booked for the student (their own booking, a family booking, or the studio booking it): in-app and email.
- Attendance recorded: "class complete" (in-app) or "class missed" (in-app and email), each with the credit used.
- A payment submitted and waiting for review: in-app (Mail) and email.
- Plan set up, or its term changed: in-app (Mail) and email.
- Free trial ending tomorrow, and trial ended (daily job, once each, never for someone who pays): in-app and email.
- Admins: an account banned or a ban lifted.
