# Part 1: Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The course view becomes the Roadmap screen at `/roadmap`, the dock becomes Home, Roadmap, Lessons, Messages, Settings, and Friends moves to the top bar.

**Architecture:** The current `/dashboard` page body moves into a shared server component rendered by both `/dashboard` (until Part 2 replaces it) and the new `/roadmap` route. Navigation lists (dock, sidebar, shortcuts, command menu, profile menu, tour hooks) are updated in place. Links that mean "your course" point at `/roadmap`.

**Tech Stack:** Next.js 15 App Router, React 18, TypeScript, Tailwind 4, lucide-react, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-29-new-home-and-roadmaps-design.md` (Part 1)

## Global Constraints

- No em dashes in copy or comments.
- Icons from `lucide-react` only.
- Every input stays at 16px or more; touch targets use the `tap` utility.
- Check at 390px and 320px phone width and on desktop, dark and light.
- Commit locally only; do not push (owner's instruction).

---

### Task 1: Roadmap route and protected paths

**Files:**
- Create: `src/app/(dashboard)/dashboard/RoadmapView.tsx` (the old page body, exported as `RoadmapView`)
- Modify: `src/app/(dashboard)/dashboard/page.tsx` (renders `<RoadmapView />`)
- Create: `src/app/(dashboard)/roadmap/page.tsx` (metadata title "Roadmap", renders `<RoadmapView />`), `src/app/(dashboard)/roadmap/loading.tsx` (re-exports the dashboard loading screen)
- Modify: `src/lib/csp.ts:54` (add `/roadmap` and `/streak` to `PROTECTED_PREFIXES`)
- Test: `tests/protectedPaths.test.ts`

**Interfaces:**
- Produces: `export default async function RoadmapView(): Promise<JSX.Element>` in `RoadmapView.tsx`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { isProtectedPath } from "@/lib/csp";

describe("isProtectedPath", () => {
  it("guards the roadmap and streak screens", () => {
    expect(isProtectedPath("/roadmap")).toBe(true);
    expect(isProtectedPath("/streak")).toBe(true);
    expect(isProtectedPath("/roadmapx")).toBe(false);
  });
});
```

- [ ] **Step 2:** `npx vitest run tests/protectedPaths.test.ts`, expect FAIL.
- [ ] **Step 3:** Add `"/roadmap", "/streak"` to `PROTECTED_PREFIXES`; move the page body into `RoadmapView`; add the two route files.
- [ ] **Step 4:** Run the test, expect PASS; `npx tsc --noEmit`.
- [ ] **Step 5:** Commit.

### Task 2: Dock, sidebar, shortcuts, command menu

**Files:**
- Modify: `src/components/layout/AppDock.tsx` (`NAV_ITEMS`: Home `/dashboard` icon `home` no tour hook; Roadmap `/roadmap` icon `roadmap` (lucide `Map`) `dataTour: "nav-roadmap"`, also active on `/scales/*`; Lessons; Messages; Settings; Friends removed)
- Modify: `src/components/layout/AppSidebar.tsx` (Main menu: Home `/dashboard`, Roadmap `/roadmap` with `match: ["/scales"]` and `nav-roadmap`, Practice, Online Lessons; Friends keeps its row in Community without the tour hook)
- Modify: `src/lib/shortcuts.ts` (add `{ key: "r", href: "/roadmap", label: "Roadmap" }`)
- Modify: `src/components/layout/CommandMenu.tsx:152` (Home item `value="home"`, new Roadmap item `value="roadmap scales course"` going to `/roadmap`)
- Modify: `src/components/layout/NavPendingGate.tsx:17` (add `"/roadmap"` with the same loading screen)
- Test: existing `npm test` (shortcuts are covered by the shortcut list tests, if any fail they name the key clash)

- [ ] **Step 1:** Make the edits above.
- [ ] **Step 2:** `npx tsc --noEmit && npm test`, expect PASS.
- [ ] **Step 3:** Commit.

### Task 3: Friends in the top bar

**Files:**
- Create: `src/components/layout/FriendsTopLink.tsx` (same shape as `LiveClassesTopLink`: `h-9 w-9 rounded-lg bg-neu-base`, lucide `Users`, `aria-label="Friends"`, `data-tour="nav-friends"`, active on `/friends*`)
- Modify: `src/components/layout/TopBar.tsx` (render `<FriendsTopLink />` inside the `hidden md:contents` group, before the admin or live classes link)
- Modify: `src/components/layout/ProfileMenu.tsx` (phone extras: `MenuLink href="/friends"` label "Friends" with the `Users` icon, first in the list)

- [ ] **Step 1:** Make the edits.
- [ ] **Step 2:** `npx tsc --noEmit && npx next lint`.
- [ ] **Step 3:** Commit.

### Task 4: Course links point at the Roadmap

**Files (each `"/dashboard"` that means "your course" becomes `"/roadmap"`):**
- `src/app/(dashboard)/scales/[scaleSlug]/components/ScaleWorkspace.tsx:392` (Back)
- `src/lib/lockedScale.ts:42,62,69` ("Back to my scales")
- `src/components/layout/SidebarSpotlight.tsx:124,187` (waiting for teacher, next scale)
- `src/lib/notifications.ts:50` (`PRACTICE_REMINDER` "Continue learning") and `:85` (`CURRICULUM_ACCESS_GRANTED`), `src/lib/notificationTargets.ts:37` (`CURRICULUM_ACCESS_GRANTED`)
- `src/app/(dashboard)/scales/[scaleSlug]/actions.ts:33,50,76` and `src/app/(dashboard)/admin/users/notes-actions.ts:59,70`: add `revalidatePath("/roadmap")` beside the existing `/dashboard` one.
- `src/components/onboarding/tourSteps.ts`: reword the `nav-roadmap` step to name the Roadmap; the `nav-friends` step now points at the top bar button.

- [ ] **Step 1:** Make the edits; `grep -rn '"/dashboard"' src` and confirm what is left means "the app's start".
- [ ] **Step 2:** `npx tsc --noEmit && npm test`.
- [ ] **Step 3:** Check in the browser at 390px, 320px and desktop, dark and light: dock shows five icons with Roadmap, top bar shows Friends from md, profile menu lists Friends on phones, `/roadmap` renders the course.
- [ ] **Step 4:** Commit.
