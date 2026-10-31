# New Home and Roadmaps: design

Date: 2026-10-29. Approved by the owner in chat after a 10 question brainstorm.

## Why

A friend who created a fresh account landed on today's Home, which is really the paying student's course view (next step, 14 scale
cards). That screen makes no sense to someone who has not started yet. The owner wants a Home that feels like home for everyone, and
the course view to become one of several roadmaps.

## Decisions (the owner's answers)

1. Home's first job: welcome the person and show the one thing to do today.
2. Future roadmaps: one per instrument, beginner and next levels, style roadmaps (worship, Ethiopian, jazz, pop), short skill roadmaps.
3. Roadmaps are added by the owner as they go, on an admin screen; nothing is shown for a roadmap that does not exist yet.
4. Roadmaps unlock in order: the others stay locked until the student finishes the current one (today's 14 scales come first).
5. A brand-new account (not paying) sees "book your free trial class" first, with a short how it works.
6. A paying student's Home holds: today's one thing, continue roadmap, next live class, daily practice with streak, friends and studio,
   and a community leaderboard (practice time adding up, streaks, badges).
7. Leaderboard: the whole studio, this week (resets Sunday), ranked by practice minutes; a Settings switch hides you.
8. Dock: Home, Roadmap, Lessons, Messages, Settings. Friends moves to the top bar beside admin, notifications and mail.
9. A roadmap on Home is a big picture card (name over artwork, progress bar, Continue), like the reference app's Verse of the Day card.
10. Extras: a tip or scale of the day, a celebration card after wins (badge, streak goal, scale unlocked), a weekly practice goal ring.

## Parts, built in this order

### Part 1: Navigation

- The current `/dashboard` content moves to `/roadmap` (title "Roadmap"). `/dashboard` keeps working as Home.
- Until Part 2 lands, `/dashboard` shows the same content as `/roadmap`, so nothing breaks in between.
- Dock: Home (`/dashboard`), Roadmap (`/roadmap`, also lit on `/scales/*`), Lessons, Messages, Settings. The tour's `nav-roadmap` hook
  moves to the Roadmap item; `nav-friends` moves to the new top bar Friends button.
- Top bar: a Friends icon button beside the admin or live classes button, notifications and mail (md and up). On phones it is listed in
  the profile menu with the other hidden top bar buttons.
- Desktop sidebar: Home, Roadmap, Practice, Online Lessons; Community keeps Friends and Messages.
- Shortcuts: G H Home, G R Roadmap (new), G F Friends stays.
- Links that mean "your course" (Continue, a scale's Back, practice return, emails about scales) point at `/roadmap`; links that mean
  "the app's start" stay on `/dashboard`.

### Part 2: The new Home (`/dashboard`)

- New account (no paid plan, no active trial): greeting, one big card "Book your free trial class" (to the class application or
  lessons), and three short how-it-works rows: live classes on Discord, your roadmap, 10 minutes of practice a day.
- Paying or trial student, top to bottom: greeting; today's one thing (the existing next-step logic); the roadmap picture card (tap
  opens `/roadmap`); next live class with countdown and Discord link; daily practice with the flame streak and a weekly goal ring; tip
  or scale of the day; the studio leaderboard (top 5 and your own place); friends practicing and studio announcements.
- A celebration card with confetti appears once after a new badge, a streak goal or a scale unlock, then goes away.
- Same flat gray cards and spacing as the rest of the app; checked at 390 and 320 px and on desktop.

### Part 3: Leaderboard

- Ranked by finger practice minutes Sunday to Saturday (Eastern), from `FingerPracticeDay.seconds`. Each row shows name, photo, minutes,
  current streak and badge count.
- New `User.hideFromLeaderboard` (default false), a switch in Settings > Privacy. Banned accounts and the admin never appear.
- Shown as a Home card (top 5 plus your own place) and a full `/leaderboard` screen.

### Part 4: Roadmaps

- New `Roadmap` table: name, slug, picture, instrument, level, order, visible flag. Each `Scale` gets a `roadmapId`; a migration puts
  today's 14 scales into the first roadmap.
- Admin screen (Admin > Setup or Classes) to create and edit roadmaps and order their scales.
- A roadmap opens only when the student has finished the one before it (every scale's checklist complete), on top of today's access
  rules (plan, trial, teacher approved drip). `/roadmap` shows the current one; a roadmap picker lists all of them with lock states.

## Not in scope

Selling roadmaps separately, drums and voice content, editing tips from the admin (tips are a fixed list in code to start).
