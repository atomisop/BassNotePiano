# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Students learning Ethiopian piano, guitar, and bass, ranging from complete
beginners (no prior music theory) to people who already play by rote but
want to actually understand the scales. One sole teacher and admin runs the
whole operation solo.

## Product Purpose

Teaches the six kiñit (Ethiopian pentatonic-family) scale groups, plus a
foundational stage (diatonic/chromatic scales, the seven modes) before any
kiñit-specific material, as one connected system rather than a library of
song-specific tabs. Success is a student who can play a kiñit scale and its
native chords correctly in any of the twelve keys, not just reproduce one
memorized piece.

## Positioning

"A spelling engine, not a song library." Most Ethiopian music resources hand
a transcription of one specific piece; learning it only lets you play that
one song, in that one key. This teaches the underlying scale grammar, so a
student can play anything in the tradition, in any key, transpose for a
singer, or jam, rather than being stuck re-learning shapes song by song.
Backed by a real published method book (Ethiopian Scales, Rhythm & Chords)
and live 1:1/family access to an actual teacher over Discord, not a
pre-recorded course.

## Operating Context

Self-paced curriculum consumed in-browser (desktop and mobile). Live lessons
happen over Discord voice/video, booked through the app and paid for with
credits. Payments for the curriculum and credit bundles are collected via
Zelle (not a card processor), verified by hand by the sole admin.

## Capabilities and Constraints

- Six kiñit scale groups plus a Foundation stage; each scale gated behind a
  quiz at an 80% pass threshold before the next unlocks.
- Piano, guitar, and bass all use the same curriculum, correctly voiced per
  instrument.
- Live lessons: one-on-one (up to 2 credits/~1 hour per booking) or a family
  session (2+ verified accounts, 2 credits per student). A group tier (up to
  10, 2 credits each) exists in the data model but isn't launched yet.
- Credits are charged once, when attendance is marked (present or absent),
  never at booking time, and never expire.
- Gamification: streaks, badges, a roadmap tracking exactly where a student
  left off.
- No card payments anywhere in the product; Zelle only.

## Brand Commitments

Name: Bass Note Piano. No em dashes in any copy or comments written for this
project (explicit, standing user preference). Never fabricate testimonials,
reviews, star ratings, or usage numbers under any framing ("we do not lie",
explicit, hard constraint, not a style preference).

## Evidence on Hand

- Real in-app screenshots exist for the dashboard and profile screens
  (`public/screenshots/dashboard.png`, `profile.png`), both verified current
  against the app's real copy. `lessons.png` existed but was stale (predated
  a booking-model change) and was removed rather than kept; a fresh capture
  is still needed and is real product work, not something to fabricate.
- No real testimonials, reviews, star ratings, or student/member counts
  exist anywhere in this app's data. Do not invent any for marketing copy.
- Real, current pricing/policy constants live in code
  (`src/lib/curriculum.ts`, `src/lib/classCreditPricing.ts`,
  `src/lib/classSchedule.ts`), pull numbers from these, never hardcode a
  price or credit rule that could drift from the real one.

## Product Principles

1. Teach the underlying system, never just surface-level tabs or shapes.
2. Every claim on the page must be independently verifiable or openly
   sourced from real product mechanics; no invented social proof, ever.
3. Real, live access to an actual teacher is a core differentiator, not
   just self-serve content.
4. Numbers shown anywhere (price, credits, thresholds) come from the same
   constants the app itself runs on, not restated by hand.
