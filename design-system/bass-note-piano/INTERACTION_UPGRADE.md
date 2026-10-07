# Bass Note Piano, Interaction Upgrade

**To: Claude Code, running in this repo.**
**Prerequisite: `REDESIGN_BRIEF.md` is already shipped**, `.glass-surface`/`.glass-surface-elevated`/`.glass-pill`, `<PhotoBackdrop>`, `<TiltGlow>`, and `BACKDROPS` are live across the site (verified: `tsc --noEmit` clean, no leftover `.glass-card`/`.glass-panel` refs, `MASTER.md` rewritten). This document is additive, it doesn't touch the material system, it adds the next layer on top: custom cursor, per-event micro-interactions, and real product visualization in place of stock-only imagery.

Reference points for this pass (study the mechanics, not the visual skin): Apple's Liquid Glass for how a material should visibly react to touch; Linear for restraint, one motion language, not five competing effects; Stripe for leading with the real product instead of decorating around it.

## 1. Custom / magnetic cursor

New component: `src/components/ui/MagneticCursor.tsx`. Scope it to marketing (`(marketing)/page.tsx`, `classes/`, `pricing/`) and auth (`(auth)/layout.tsx`) only, leave the dashboard app shell alone, a custom cursor over dense tables/forms is a liability, not polish.

- Default cursor stays the system cursor. On hover over any interactive element (`<a>`, `<button>`, `.glass-surface`, `.glass-surface-elevated`, `.glass-pill`), it morphs: scale up slightly, soften opacity, no full replacement icon.
- **Magnetic pull**: primary CTA buttons (`.cta-sheen` elements) and `.glass-surface-elevated` panels pull the cursor toward their own center within a small radius (~24-32px) as it enters their bounding box, using a spring (reuse the `useSpring`/`stiffness: 200, damping: 20` pattern already established in `TiltGlow.tsx`, don't invent a second spring config).
- Touch devices: no-op entirely, detect via `(hover: hover) and (pointer: fine)`, don't ship a cursor effect that breaks touch scrolling.
- `prefers-reduced-motion`: cursor still morphs on hover (that's instant, not motion), but the magnetic pull is disabled, snap straight through, no spring lag.

## 2. Purpose-built micro-interactions per event

Replace the current pattern (one generic hover/transition class reused everywhere) with a distinct, small animation per meaningful event. Each of these already has a component, extend it, don't build a parallel system:

| Event | Component | What to add |
|---|---|---|
| Quiz passed | `src/components/progression/QuizModal.tsx`, `QuizLauncher.tsx` | A settle-in celebration on the pass state, score counts up, a brief amber glow pulse on the result card (`.glass-surface-elevated`), not a generic fade |
| Badge unlocked | `src/components/gamification/BadgeSummary.tsx`, `BadgeGrid.tsx` | New badge scales in with a spring overshoot (`stiffness ~300, damping ~15`, snappier than the standard entrance, this one moment should feel like a reward) |
| Streak milestone | `src/components/gamification/StreakDots.tsx` | The newly-filled dot gets a brief pulse/glow distinct from the rest, not just an instant color swap |
| Message sent | `src/app/(dashboard)/messages/components/ChatWindow.tsx`, `GroupChatWindow.tsx` | Bubble enters with a quick rise + settle, matching the existing entrance spring values from `MASTER.md`, don't diverge, just apply it here specifically |
| Form validation error | every `(auth)/*/actions.ts` consumer (`login`, `register`, `forgot-password`, `reset-password`) | A short horizontal shake on the field/border-color flash to `--negative` (`red-400`), auto-clears on next valid input, currently these likely just show static red text, give the error state motion |
| Payment/booking confirmed | `src/components/progression/ZellePaymentModal.tsx`, `src/app/(dashboard)/admin/bookings/actions.ts` consumers | Same settle-in celebration language as quiz-pass, reused not reinvented, confirms these are "success" events in the same visual family |

All of the above: respect `prefers-reduced-motion` (collapse to instant end-state, no exceptions, this list doesn't get to skip the rule the rest of the system follows).

## 3. Real product visualization on the marketing page

Right now the marketing "curriculum" section and instrument sections show photography only. Stripe/Linear/Vercel all lead with the *actual interface*, not just mood, do the same here without turning it into a demo video project:

- In the "curriculum" section (`(marketing)/page.tsx`), add one real, static view of the in-app roadmap, either a styled screenshot of `ScaleRoadmap` in its completed state, or reuse the actual `ScaleRoadmap` component server-rendered with sample/mock progress data, presented inside a `.glass-surface-elevated` panel floating over the `BACKDROPS.curriculum` photo. This replaces "here's a photo of a piano and a grid of scale names" with "here's what you'll actually be looking at."
- Keep it to one instance, this is a single proof-of-product moment on the homepage, not a rebuild of every section into live app embeds.
- If mock data is needed to avoid exposing real user state on a logged-out marketing page, add it locally in that section rather than wiring up a new data-fetching path.

## Execution order

1. Ship the cursor first (`MagneticCursor.tsx`), it's isolated, low-risk, easy to verify in isolation on the marketing page before touching anything else.
2. Work through the micro-interactions table top to bottom, each is scoped to one component, verify each in isolation (trigger the event, confirm the animation, confirm it collapses correctly under reduced motion) before moving to the next.
3. Do the real-product-visualization section last, it touches shared components (`ScaleRoadmap`) so it's the one place to double-check nothing on the actual dashboard regressed.
4. `npx tsc --noEmit` clean, then a full `npm run build` on your end (mine hung in this sandbox, confirm locally) before calling it done.
5. Self-review: trigger every event in the table above at least once, confirm the cursor behaves correctly on both a real cursor device and a touch emulation, confirm reduced-motion still fully disables everything it's supposed to.
