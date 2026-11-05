# Strict prompt: full-app polish and motion revamp, one control at a time

Paste everything below the line to Claude. It combines two jobs in one pass: the visual polish of every screen and every control (design language, UX laws) and the 20 motion rules in `docs/ANIMATION-PROMPT.md`.

Why this prompt is built this way: long runs that "revamp everything" fail because nothing is visible until the end. So this one forces a short loop, a written checklist, a screenshot after every screen, and a stop point every 5 screens. Progress you can see is part of the job, not a bonus.

---

## ROLE AND AUTHORITY

You are revamping Bass Note Piano's whole signed-in and public UI. Read these first, in this order, and treat them as law: `CLAUDE.md`, `PRODUCT.md`, `DESIGN.md`, `docs/ANIMATION-PROMPT.md`. If anything here conflicts with them, stop and tell me. Do not decide alone.

## HARD RULES (breaking any of these means you stop and report)

1. **No big-bang.** Work on exactly ONE screen at a time, and inside it ONE control at a time. Never edit two screens in one step.
2. **Tokens only.** Use the existing type, radius, color and spacing tokens from `DESIGN.md` and `globals.css`. No px sizes, no `text-[rgb(...)]`, no new colors. If a needed token does not exist, add it once in `globals.css` and say so.
3. **Icons** come only from `@/components/ui/appIcons` (coolicons mapping). Never hand-draw an icon or add an icon library.
4. **Touch targets:** every control at least 36px tall, or carries the `tap` utility (44px on touch). Inputs at least 16px font. Check 390px and 320px wide.
5. **Motion:** only `transform` and `opacity` (plus `clip-path` for masks). No `transition: all`. Reduced motion and hover-gating ship with every animation. A keyboard shortcut never animates (`markKeyboardAction()`).
6. **Do not change behavior.** No logic, data, route, copy meaning or permission changes. Look and motion only. If a change needs logic, list it under "Needs your decision" and move on.
7. **No em dashes** in any copy or comment.
8. **Git:** commit locally only. Never push, open a PR or merge unless I say so in this chat. Stage files by path, never `commit -a`. One commit per screen: `Polish <screen>: <one line>`.
9. **Never touch** payment, auth, booking or access logic files, even to restyle. Restyle only the components that draw them.
10. **No second library** for animation except Motion's `layoutId` where rule 20 needs it. Everything else CSS or WAAPI.

## STEP 0: SET UP (do this before touching any screen)

1. Run the floorplan query to list every screen and shared component. Build `docs/revamp/CHECKLIST.md`: one row per screen, with columns `Screen | Route | Status | Before shot | After shot | Notes`. Include every public page, every signed-in page, every admin page, and every shared overlay (dock, top bar, sidebar, menus, dialogs, sheets, toasts, Atom widget, banners).
2. Build `docs/revamp/AUDIT.md`: the design language in ONE page, derived from `DESIGN.md`: type scale, corner steps, spacing steps, the one accent color, button sizes (small, default, large), icon sizes, and the motion tokens below. Show it to me. Wait for my "go". Do not start editing before that.
3. Add the motion tokens once (durations, curves, stagger step) and the shared pieces (see "Shared pieces"). Show me a screenshot of each in a small preview. Wait for "go" again.

## THE LOOP (run this for every screen, in checklist order, no skipping)

For one screen:

1. **Before shot** at 390px and at desktop width, light and dark. Save to `docs/revamp/shots/<screen>-before-*.png`.
2. **List every control** on the screen (buttons, links, inputs, switches, tabs, chips, menus, cards, rows, icons). Write the list into the checklist notes.
3. **Go control by control.** For each one, in a row in the checklist:
   - Measure it: size, padding, radius, font size, color, icon size.
   - Compare to the design language in `AUDIT.md`. Fix anything that does not match: size, radius, spacing, alignment, color, weight, icon, hit area, state (hover, pressed, focus-visible, disabled, loading).
   - Check it against these UX laws and fix breaches: Fitts (big enough and near the thumb), Hick (not too many choices at once), Jakob (looks like the same control elsewhere), Proximity and Common Region (related things grouped, unrelated apart), Miller (no more than about 7 items in a group), Doherty (feedback within 400 ms), Aesthetic-Usability (consistent, clean), Tesler (don't push complexity to the user), Postel (forgiving inputs), contrast WCAG AA.
   - Apply the matching motion rules (list below) to that control.
   - Mark it done in the checklist with a one-line note of what changed.
4. **After shot** at the same sizes. Save to `docs/revamp/shots/<screen>-after-*.png`.
5. **Verify:** `npx tsc --noEmit`, `npx next lint` on touched files, and load the screen in the preview with no console errors. Fix what breaks.
6. **Commit** the screen alone.
7. **Report in this exact format**, then continue to the next screen:

```
SCREEN: <name>   (<n> of <total>)
Controls fixed: <count>   Left alone: <count>
Changed: <3 to 6 short bullets, plain words>
Motion applied: <rule numbers>
Needs your decision: <list or "none">
Shots: before and after (attached)
```

## STOP POINTS (mandatory)

- After every **5 screens**, stop, send the before and after shots of those 5 side by side in one image, and wait for my reply ("continue", "change X").
- If I say "change X", fix it and re-show before moving on.
- Never run longer than about 5 minutes without sending something I can see. If a step is slow (dev server, build), say so in one line right away.

## MOTION RULES TO APPLY (full text in `docs/ANIMATION-PROMPT.md`; this table says where each one goes)

| # | Rule | Where it goes |
|---|---|---|
| 1 | Ease-out for entrances | Every enter animation |
| 2 | Dropdowns 150 to 250 ms | Profile menu, admin menus, selects, command menu |
| 3 | Stagger list rows 30 ms | Lists: lessons, messages, notifications, payments, admin tables |
| 4 | Scale 0.97 on press | The shared Button and every tappable row and card |
| 5 | Stretch knobs 12% | Switch, sliders |
| 6 | Stagger as details settle | Cards that load with child content |
| 7 | Arcs for object movement | A class moving to a slot, a card flying to another place |
| 8 | Pulse to confirm success | Payment approved, class booked, practice done, saved |
| 9 | Ease-in-out for moves | Anything already on screen that moves |
| 10 | Popovers start at 0.95 | Popovers, menus, tooltips |
| 11 | Enter from the trigger | Same set, `transform-origin` at the trigger |
| 12 | Exit to the trigger | Same set |
| 13 | No bounce on everyday UI | Everywhere except drag release, dock and playful moments |
| 14 | Don't tween while held | Drag, swipe, pull to refresh |
| 15 | Exits 20% shorter | Every exit |
| 16 | Overlap old and new | Tab and page content swaps |
| 17 | Masks for reveals and color | Expanding sections, theme change, badge change |
| 18 | Crossfade icons with scale and blur | Any icon that changes state |
| 19 | Rubber band past bounds | Drags with limits, sheets, carousels |
| 20 | Reuse the same layoutId | Card to detail, row to sheet, tab indicator |

If a rule does not fit a control, write "n/a" with a reason in the checklist. A silent skip is a failure.

## SHARED PIECES (build once in Step 0, reuse everywhere)

`Button` press (0.97), `Switch` stretch (12%), `Popover` / `Menu` / `Tooltip` origin and exit, `StaggerList`, `IconSwap`, `SuccessPulse`, `MaskReveal`, `useRubberBand`, `useArc`, a `layoutId` wrapper. Screens use these. A screen that re-implements one of them by hand fails review.

## WHAT "POLISHED" MEANS (the bar for each control)

- It matches its siblings: same height, radius, padding, weight and icon size as every other control of its kind in the app.
- Spacing sits on the spacing scale. Things that belong together touch the same edge.
- One accent color, used only for the main action on a screen. Everything else is neutral.
- Every state exists and looks intentional: rest, hover (pointer only), pressed, focus-visible, disabled, loading.
- Text is on the type scale, aligned, and never wraps awkwardly at 320px.
- If you would not be proud of it in a screenshot next to Instagram or Linear, it is not done.

## DEFINITION OF DONE

- Every row in `CHECKLIST.md` is Done or has a reason.
- No console errors, `tsc` and lint clean on touched files, tests that ran before still pass.
- `docs/revamp/SUMMARY.md` lists: screens done, controls fixed, motion rules applied per screen, and every "Needs your decision".
- Nothing pushed. I decide when to open the PR (batch of up to 10 commits per PR).

## IF YOU ARE UNSURE

Stop and ask in one short sentence with two options. Do not guess, do not widen scope, do not "also fix" something nearby. A smaller correct change beats a bigger risky one.
