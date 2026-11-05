# Design language, one page (derived from DESIGN.md and globals.css)

Nothing here is new. It is the existing system, written down as the bar each control is measured against.

## Type (6 steps)
| Token | px | Use |
|---|---|---|
| caption | 12 | eyebrows (uppercase), meta, counts |
| small | 13 | labels, buttons, rows, most UI text |
| body | 16 | reading text, chat, inputs (never below 16 for inputs) |
| title | 20 | a card or section heading |
| headline | 24 | the one big line on a feature card |
| hero / figure | 28-44 / 52-64 | page title (one per page) / a counter |

Weights: 400 text, 500 labels, 600 titles and buttons. Tabular numbers in the app.

## Corners (5 steps, no other)
8 small controls and chips · 12 fields and rows · 16 cards · 24 sheets · full pill for buttons, chips, avatars, dock.

## Spacing (4-point grid)
Inside a card 16 phone / 20 desktop. Between cards 12 / 16. Between page sections 32 / 48.

## Color
Ground, one-step-lighter card, 11-step neutral ramp. ONE accent (logo orange, `signal`), only for the screen's next step, at most 3 per screen. Success emerald, warning amber, danger red, never decoration. Orange text is `text-signal-fg`. Text never lighter than slate-500 on dark. Contrast WCAG AA.

## Buttons (the shared `Button`)
| Size | Height | Padding | Use |
|---|---|---|---|
| sm | 32 (+`tap` = 44 on touch) | 12 | dense rows, admin tables |
| default | 36 | 16 | everything normal |
| lg | 40 | 20 | the one main action on a form |
| icon / iconSm | 36 / 32 square | 0 | icon-only (needs aria-label) |

Always `rounded-full`, `text-small`, weight 500-600. Variants: default (the one accent action), secondary, outline, ghost, destructive, danger (final irreversible step only), link. Every one needs rest, hover (pointer only), pressed, focus-visible, disabled, loading.

## Icons
Coolicons through `@/components/ui/appIcons` only. Sizes: 16 inline in text, 20 in buttons and rows, 24 in the dock/top bar, 26 dock. Stroke and fill follow the set; never hand-drawn.

## Motion tokens (what exists, what I will add)
| Token | Value | Status |
|---|---|---|
| `--ease-ios` | cubic-bezier(.32,.72,0,1) | exists, the default ease-out for entrances (rule 1) |
| `--ease-spring` | cubic-bezier(.22,1.12,.36,1) | exists, quiet overshoot (drag release, dock only: rule 13) |
| `--dur-fast / base / slow` | 140 / 240 / 320 ms | exists |
| `--ease-move` | cubic-bezier(.65,0,.35,1) ease-in-out for on-screen moves (rule 9) | **to add** |
| `--dur-menu` | 180 ms (menus 150-250: rule 2); exit = 80% (rule 15) | **to add** |
| `--stagger` | 30 ms per row, cap 8 rows (rule 3) | **to add** |
| press scale | 0.97 (rule 4); popover start 0.95 (rule 10); knob stretch 12% (rule 5) | **to add** |

## Shared pieces to build in Step 0 (previews, then "go")
`Button` press 0.97 (extend existing `press`), `Switch` stretch, `Popover/Menu/Tooltip` origin + exit, `StaggerList`, `IconSwap`, `SuccessPulse` (a `SuccessGlowPulse.tsx` exists, I will reuse/extend it), `MaskReveal` (`Collapse.tsx` exists), `useRubberBand`, `useArc`, `layoutId` wrapper.

## Conflicts I found between the prompt, the docs and the code (need your call before I edit)

1. **RESOLVED 2026-11-05: raised buttons stay; DESIGN.md updated.** (was: Depth "flat" vs the real Button.) `DESIGN.md` says flat: solid cards, no border or shadow, shadow only on floating things. But `button.tsx` is built on a neumorphic depth system (`liquid`, `shadow-pressed-low`, `shadow-raised-mid`, lift on hover) and the dock/glass changes were just reverted (#378). The prompt says "tokens only, match DESIGN.md". **Option A (recommended):** DESIGN.md wins; buttons go flat (solid fill, press = scale 0.97, no raised shadow). **Option B:** keep the raised look and update DESIGN.md.
2. **Button comments say "signal green"**, DESIGN.md and the brand memory say orange. Code uses `--cta-bg`, so this is a stale comment only; I will fix the comment when I touch the file.
3. **Rule 20 (`layoutId`)**: `framer-motion` ^11.3 is already installed, so no new dependency. I will use its `layoutId` only for rule 20 and keep everything else CSS/WAAPI. Confirm that is what you meant.
4. **Stray duplicates** with a " 2" suffix (`ActionMenu 2.tsx`, `DeckStack 2.tsx`, `coolicons 2.ts`, ...), the known Desktop duplicate-file gotcha. I will not edit or delete them; say so if you want them removed.
5. **Rule 13 vs existing springs:** `--ease-spring` and the dock spring exist. I keep them for the dock and drag release only and move everything else to `--ease-ios`.
