# Part 2: New Home Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/dashboard` becomes a real Home: a welcome and a free trial class card for a new account, and today's cards for a student.

**Architecture:** Pure rules (week start, weekly minutes, tip of the day, which win to celebrate) live in `src/lib/homeRules.ts` with tests. One server loader `getHomeData` in `src/lib/homeData.ts` reads everything Home shows. The page composes small card components from `src/components/home/`. The leaderboard card is added in Part 3 (it needs the hide-me switch first).

**Tech Stack:** Next.js 15 App Router server components, Prisma, lucide-react, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-29-new-home-and-roadmaps-design.md` (Part 2)

## Global Constraints

- No em dashes in copy or comments. Icons from `lucide-react` only.
- Same flat card material (`Card`), checked at 390px, 320px and desktop, dark and light.
- Never reuse one rendered element in two places (phone and desktop copies are separate calls).
- Commit locally only; do not push.

---

### Task 1: Home rules (pure, tested)

**Files:** Create `src/lib/homeRules.ts`; Test `tests/homeRules.test.ts`

**Produces:**
- `WEEKLY_GOAL_MINUTES = 70`
- `weekStartKey(today: string): string` (the Sunday on or before `today`, YYYY-MM-DD)
- `minutesThisWeek(rows: { day: string; seconds: number }[], today: string): number` (whole minutes, days from the week start to today)
- `TIPS: { title: string; body: string }[]` and `tipOfTheDay(today: string): { title: string; body: string }` (same tip all day, a different one each day)
- `type Win = { kind: "badge" | "scale" | "streak"; key: string; title: string; detail: string; at: Date }`
- `pickCelebration(wins: Win[], now: Date, maxAgeDays = 7): Win | null` (the newest win within the window)

- [ ] Write the tests (week start on a Sunday and mid week, minutes summed only this week, tip stable within a day and changing across days, newest win chosen, old wins ignored), run them failing, implement, run passing, commit.

### Task 2: Home data loader

**Files:** Create `src/lib/homeData.ts`

**Produces:** `getHomeData(user: { id: string; role: string; email: string | null }): Promise<HomeData>` with
`{ name, isNew, starting (GettingStartedStep | null), nextStep (NextStep), progress (summariseProgress), currentScaleTitle, nextClass, practice (FingerPracticeStatus), weekMinutes, friendsPracticing: string[], friendCount, celebration (Win | null), tip }`.
`isNew` is true when the entitlement kind is `NONE` and the person is not an admin. The next step uses the same rules as the Roadmap screen (`gettingStartedStep`, `resolveNextStep`, `putFingerPracticeFirst`).

- [ ] Implement, `npx tsc --noEmit`, commit with Task 3.

### Task 3: Home page and cards

**Files:**
- Create `src/components/home/RoadmapCard.tsx` (big artwork card: warm gradient with drawn piano keys, roadmap name, current scale, progress bar, Continue to `/roadmap`)
- Create `src/components/home/WeekRing.tsx` (`ProgressRing` of `weekMinutes / WEEKLY_GOAL_MINUTES`)
- Create `src/components/home/CelebrationCard.tsx` (client: shows the win once per win key, confetti via `Celebrate`, dismiss stored in localStorage `bnp-celebrated-<key>`, wrapped in try/catch)
- Replace `src/app/(dashboard)/dashboard/page.tsx` (new account: greeting, trial card from `starting`, three how-it-works rows; student: greeting, celebration, today's one thing, roadmap card, next class, practice with streak and week ring, tip of the day, friends)
- Replace `src/app/(dashboard)/dashboard/loading.tsx` to mirror the new layout

- [ ] Build, `npx tsc --noEmit && npx next lint && npm test`, check in the browser at 390px, 320px and desktop in dark and light, for a new account and a student, commit.
