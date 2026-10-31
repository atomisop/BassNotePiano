# Part 4: Roadmaps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The owner can add roadmaps and their scales in the admin; students see their roadmaps in order, each opening after the one before is finished.

**Architecture:** The curriculum stays one ordered chain of `ScaleGroup` rows (`order` 0..n-1, unique), so the existing teacher-approved drip, trial and access rules keep working untouched. A new `Roadmap` table groups consecutive scales into chapters; `ScaleGroup.roadmapId` (nullable, null means the first roadmap) says which. Any structural change (new roadmap order, new scale, moved scale) renumbers every scale's `order` from roadmap order then position (`planScaleOrder`). Because the chain continues across roadmaps, roadmap 2's first scale is simply the next scale to approve after roadmap 1's last: "locked until you finish the one before" comes for free. Hidden roadmaps are left out for students and out of the approval chain.

**Tech Stack:** Prisma 5 + Postgres (hand-written migration, verified with `prisma migrate diff`), Next.js server actions, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-29-new-home-and-roadmaps-design.md` (Part 4)

## Global Constraints

- Migrations hand-written in Prisma's style and verified against a throwaway Postgres (`-- This is an empty migration.`).
- Admin actions: admin session required, inputs validated on the server, audited (`roadmap.create`, `roadmap.update`, `roadmap.move`, `scale.create`, `scale.move`) with labels in `auditView.ts`.
- No deletes (irreversible); a roadmap is hidden instead.
- No em dashes; lucide icons only; 16px inputs; checked at 390px, 320px and desktop.
- Commit locally only.

---

### Task 1: Schema and migration
- `Roadmap { id, slug @unique, name, description?, instrument?, level?, artwork @default("dusk"), order Int @unique, visible @default(true), scales, createdAt, updatedAt }`
- `ScaleGroup.roadmapId String?` + relation (`onDelete: SetNull`) + `@@index([roadmapId])`
- Migration `20261115000000_roadmaps`: create table and indexes, add column and FK, insert the first roadmap (`id 'roadmap-scales'`, slug `scales`, name `Scales`, order 0) and point every existing scale at it.
- Verify with the throwaway database; apply to the dev database.

### Task 2: Rules (pure, tested) `src/lib/roadmapRules.ts`, `tests/roadmapRules.test.ts`
- `FIRST_ROADMAP_ID = "roadmap-scales"`, `ROADMAP_ARTWORKS` (dusk, ocean, forest, plum: two gradient stops each), `ROADMAP_INSTRUMENTS`, `ROADMAP_LEVELS`
- `slugifyRoadmap(name: string): string`
- `planScaleOrder(roadmaps: {id; order}[], scales: {id; roadmapId: string | null; order: number}[]): Map<string, number>`
- `summarizeRoadmaps(roadmaps, scales: {roadmapId; status; canAccess}[])`: per roadmap total, completed, percent, `open` (some scale reachable), `done`; and `currentRoadmapId` (the first open roadmap that is not done, else the last open one, else the first).

### Task 3: Server side `src/lib/roadmaps.ts`
- `renumberScales(tx)`, `listRoadmapsForAdmin()`, `createRoadmap`, `updateRoadmap`, `moveRoadmap(id, "up" | "down")`, `addScale(roadmapId, { code, title, formula, description })`, `moveScale(id, "up" | "down")`, `getVisibleRoadmaps()`.
- `getRoadmap` (access.ts) and `loadApprovalStates` (scaleApproval.ts) leave out scales of hidden roadmaps for anyone but the admin.

### Task 4: Admin screen `src/app/(dashboard)/admin/roadmaps/` (Setup > Roadmaps)
- List in order: artwork swatch, name, level, instrument, visible switch, up and down, edit; each roadmap's scales with up and down; "Add a scale" form; "New roadmap" form.

### Task 5: Students
- `/roadmap?roadmap=<slug>` (not `?r=`, which is the emailed-link owner tag): a strip of roadmap cards (name, progress, lock) above the scales; the chosen (or current) roadmap's scales only; a locked roadmap says which one to finish first.
- Home's roadmap card shows the current roadmap's name, artwork and progress.

### Task 6: Verify
- `tsc`, lint, `npm test`, `npm run test:db` for the access and approval suites, browser at 390, 320 and desktop, security review of the admin actions.
