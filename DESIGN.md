# Design system, Bass Note Piano

The rules every screen follows. Tokens live in `src/app/globals.css` (the `@theme` block and the
"Design system" section) and `src/app/themes.css` (the per-theme ramps). Components read tokens,
never a raw hex, px size or font name.

```text
Feeling:  a calm, flat, dark practice studio. Content first, chrome quiet, one warm accent.
Type:     Baloo 2 for page titles only. Inside the app everything else is the system font (SF Pro on Apple devices),
          labels in sentence case; the public pages use Sora. JetBrains Mono for keys and codes.
          Six steps: caption 12 · small 13 · body 16 · title 20 · headline 24 · hero 28 to 44 (fluid), plus one big figure for counters.
          Weights: 400 text, 500 labels, 600 titles and buttons. Tabular numbers everywhere in the app.
Colour:   ground #121212, cards one solid step lighter, an 11-step neutral ramp (slate-50 … slate-950).
          One accent, the logo orange (signal), meaning "your next step" or "tap this": at most 3 per screen.
          States: success (emerald), warning (amber-300), danger (red). Light theme mirrors all of it.
Shape:    soft. 8 small controls and chips · 12 buttons' boxes, fields and rows · 16 cards · 24 sheets.
          Buttons and filter chips are full pills. No other radius.
Depth:    cards are a solid fill with no border or shadow. Buttons are raised (the `liquid` fill with a soft shadow, decided
          2026-11-05 in the revamp): they lift on hover, and press IN and dip to 0.97 while held. Things that float over the
          page (menus, dialogs, sheets, the dock and the top bar) get the one floating shadow.
```

## Type

| Token | Size | Use |
|---|---|---|
| `text-caption` | 12 / 1.35 | eyebrows (uppercase, `tracking-caps`), meta, counts, keycaps |
| `text-small` | 13 / 1.4 | labels, buttons, list rows, most UI text |
| `text-body` | 16 / 1.6 | reading text: lesson instructions, chat, descriptions |
| `text-title` | 20 / 1.3 | a card's or section's own heading |
| `text-headline` | 24 / 1.2 | the one big line on a feature card (Home's next step) |
| `text-hero` | 28 to 44 / 1.02 | the page title (Baloo 2), one per page |
| `text-figure` | 52 to 64 / 1 | a counter that is the point of the screen (the streak) |

Tiny count badges (the 9+ on the bell) keep 10px; nothing else sits off the scale.

Marketing pages may use larger display sizes for their hero only.

## Colour roles

| Role | Class | Notes |
|---|---|---|
| Page | `bg-ground` | `#121212` dark, `#f2f2f5` light |
| Card | `bg-neu-base` (via `Card`) | one solid step above the page |
| Card inside a card, hover | `bg-neu-lift` | one more step |
| Text | `text-slate-50` | primary |
| Secondary text | `text-slate-300` / `text-slate-400` | never below `slate-500` for text |
| Hairline | `border-slate-800` | dividers inside cards |
| Accent | `bg-signal` + `text-signal-ink`, `text-signal-fg` | the next step only |
| Success, warning, danger | `emerald-400`, `amber-300`, `red-400` | states, never decoration |

## Shape

| Token | Value | Classes that land on it |
|---|---|---|
| small | 8px | `rounded`, `rounded-sm`, `rounded-md` |
| control | 12px | `rounded-lg`, `rounded-xl`, `rounded-control` |
| card | 16px | `rounded-2xl`, `rounded-card` |
| sheet | 24px | `rounded-3xl`, `rounded-sheet` |
| pill | full | `rounded-full`: buttons, chips, avatars, the dock |

## Spacing

4-point grid. Inside a card 16 (phone) / 20 (computer); between cards 12 / 16; between page sections 32 / 48.

## Motion

150 to 200 ms for hover and press, 240 ms for things entering, the iOS curve (`ease-ios`). Reduced motion gets none.
Revamp tokens (globals.css): `--ease-move` ease-in-out for things already on screen, `--dur-menu` 180 ms (exit 80%), `--stagger` 30 ms,
`--press-scale` 0.97, `--pop-scale` 0.95, `--knob-stretch` 1.12. No bounce on everyday UI; springs only for the dock and drag release.
Shared pieces: `pop` (popovers, menus, tooltips), `stagger-item` / `StaggerList`, `knob-stretch` (Switch), `IconSwap`, `SuccessPulse`,
`MaskReveal`, `SharedLayout` (layoutId), `useRubberBand`, `useArc`. Screens reuse these; they are not rebuilt by hand.
