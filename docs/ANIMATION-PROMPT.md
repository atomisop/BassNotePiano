# Animation prompt: the 20 motion rules for Bass Note Piano

Paste this to Claude as the brief. Build each rule as a shared token or helper first, then apply it screen by screen. Work in batches of 10 changes per PR.

## Ground rules (these beat everything below)

- Motion tokens live in one place (`globals.css` custom properties plus `src/lib/motion.ts`). Never hard-code a duration or curve in a component.
- `transform` and `opacity` only. Never animate width, height, margin or top/left. Never `transition: all`.
- Anything started from a keyboard shortcut never animates (`markKeyboardAction()` already exists; respect it).
- `prefers-reduced-motion`: keep fades and color changes, drop movement, scale, stretch and arcs.
- Hover motion only under `@media (hover: hover) and (pointer: fine)`.
- No em dashes in copy or comments. Check phone width (390px and 320px) for every change.
- Show me a screenshot or short recording of each batch before any commit.

## The 20 rules (same order as the reel)

1. **Ease-out for entrances.** `cubic-bezier(0.23, 1, 0.32, 1)`. Never ease-in on UI.
2. **Dropdowns at 150 to 250 ms** (default 200 ms).
3. **Stagger list rows by 30 ms** each (cap at 8 rows, the rest appear together).
4. **Scale to 0.97 on press**, 120 ms, back on release. Wire it once into the shared `Button`.
5. **Stretch moving knobs by 12%** (switch, slider thumb) along the travel direction while moving, then settle back.
6. **Stagger as details settle:** the container lands first, then its children 30 ms apart.
7. **Arcs for object movement:** an object travelling across the screen follows a gentle curve (small sideways offset in the middle), not a straight line.
8. **Pulse to confirm success:** one ring or glow that grows and fades once, 400 ms (payment approved, class booked, checklist done).
9. **Ease-in-out for moves** of things already on screen: `cubic-bezier(0.77, 0, 0.175, 1)`.
10. **Start popovers at 0.95** scale plus `opacity: 0`. Never `scale(0)`.
11. **Enter from the trigger:** `transform-origin` at the button that opened it, not the center. Modals stay centered.
12. **Exit to the trigger:** shrink back into the trigger, do not fade out from the center.
13. **No bounce on everyday UI** (menus, tabs, navigation). Springs only for drag release, the dock and playful moments, bounce 0.1 to 0.3.
14. **Don't tween while held:** while a finger is down, motion follows the finger directly. On release it hands off to a spring that keeps the finger's speed.
15. **Make exits 20% shorter** than entrances (enter 200 ms, exit 160 ms).
16. **Overlap old and new states:** the new state comes in as the old one leaves (60 to 100 ms overlap), never a blank gap.
17. **Masks for reveals and color:** reveal content and change color with a mask or `clip-path` wipe instead of a plain fade (expanding sections, theme change, status badge change).
18. **Crossfade icons with scale and blur:** old icon goes to 0.8 scale and 4px blur while the new one comes in from that state (play and pause, menu and close).
19. **Rubber band past bounds:** dragging beyond a limit meets growing resistance and springs back on release.
20. **Reuse the same layoutId:** one shared object keeps one layout ID so it expands or moves into its next place instead of being replaced (card to detail, list row to sheet, tab indicator). The reel's example: "Project brief" expands into the detail, rather than a disconnected replacement.

## How to work

1. Add the tokens: durations (`--dur-press 120ms`, `--dur-menu 200ms`, `--dur-enter 200ms`, `--dur-exit 160ms`, `--dur-reveal 280ms`), curves, stagger step (30 ms), and the scale values (0.97, 0.95).
2. Build the shared pieces once: `Button` press, `Switch` stretch, `Popover/Menu/Tooltip` origin and exit, `StaggerList`, `IconSwap`, `SuccessPulse`, `MaskReveal`, `useRubberBand`, `useArc`, shared layout ID wrapper.
3. Apply them to the screens in this order: Home, Lessons, Billing, Settings, Messages, then admin.
4. For each rule, list the screens it touched and anything I skipped on purpose, and why.
5. Add `tests/motionTokens.test.ts` to check that exit is shorter than enter, menu duration is within 150 to 250 ms, and no component hard-codes a duration.

## Notes

- Rules were checked against the reel's own on-screen list (2026-11-05).
- Where a rule asks for the same layout ID, use Motion's `layoutId` (it is the one place a library is worth adding); everything else is CSS or WAAPI.
