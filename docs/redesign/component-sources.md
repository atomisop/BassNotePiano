# Component sources (STEP 3)

Every borrowed component, where it came from, its license, and how it was
restyled to the design system (ink and paper plus one signal green, three
type tiers, three depth planes). Rule: no heavy libraries for small
effects, and nothing loaded from a CDN (the site's security policy only
allows our own origin for scripts, styles, and fonts).

| Component | Source | License | What was taken | Restyling |
|---|---|---|---|---|
| `ui/Tabs.tsx` sliding thumb | Halaska UI "SegmentedControl" via 21st.dev (https://21st.dev/@halaska-studio/components/segmented-control) | MIT, (c) Halaska | The technique only: measure the active segment and slide one absolutely positioned thumb under it | Rebuilt on our tokens; the thumb is the signal tint (selected = tappable); `role="tablist"` with arrow/Home/End keys; no motion under reduced motion; no new dependencies |
| `ui/Dialog.tsx` (bottom sheet on phones, modal on desktop) | Radix UI Dialog primitive (`@radix-ui/react-dialog`, already a dependency) | MIT | The primitive (focus trap, Escape, labelling) | Our own layout: iOS-style grab handle and bottom sheet below md, centered modal above; opaque surface on the overlay layer |
| `ui/button.tsx` | shadcn/ui Button (already in the repo) | MIT | Variant structure (cva) | New variants and sizes: green `default`/`primary` only for the section's main action, `paper` for neutral solid, 44px tap height, front-plane shadow |
| `ui/switch.tsx` | shadcn/ui Switch on `@radix-ui/react-switch` (already in the repo) | MIT | Unchanged | Checked state stays signal green (a toggle is tappable) |
| `progression/ScaleViewToggle.tsx` | 21st.dev "View Mode Toggle Group" pattern (already in the repo) | Pattern only | Icon-only segmented toggle | Pressed option uses the shared signal tint |
| `scales/KeySelector.tsx` | Own markup, role="group" + aria-pressed pattern from 21st.dev toggle groups (already in the repo) | Pattern only | Accessible single-select group | 44px targets, signal tint on the chosen key |
| `scales/InstrumentStage.tsx` `ScaleChart` table | 21st.dev "Pinnable Columns Table" pattern (already in the repo) | Pattern only | Sticky first column, plain CSS | Current key row is paper, not green (it is information) |
| `scales/useMetronome.ts` | Written for this app (Web Audio look-ahead scheduling, the standard technique) | Ours | n/a | Paper beat dots; the panel's one green button is Start/Stop |
| Icons | `lucide-react` and `@radix-ui/react-icons` (already dependencies) | ISC / MIT | Icons | Inherit text color; never green unless the control is |

## Looked at and not used

| Component | Why not |
|---|---|
| 21st.dev "Data Table Row Selection" (felipemenezes098) | No license stated, so no code was copied. Bulk actions in admin would also be new behavior on payments and accounts; left as a decision for the owner (see PROGRESS.md). |
| 21st.dev "Advanced Data Table Filter Builder" | Far heavier than the admin lists need (each has a handful of filters). |
| 21st.dev "Chat Bubble Thread" (bundui) | The app's MessageBubble already groups and aligns messages; only its colors and type sizes needed the design-system pass. |
| 21st.dev "Preferences Card" (ssychui) | Settings already has an iOS-style list on phones and a side menu on desktop. |
| Aceternity UI / Magic UI effects | Decorative motion and glow effects conflict with the depth rules (real overlap and shadow, not effects) and would add weight on phones. |
