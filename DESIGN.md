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

## Hierarchy (2026-11-10, owner: whole app; replaces "Quiet cards")

The owner's complaint: "everything looks similar and I can't focus on anything." Every screen now passes the squint test: blur your eyes and one
thing per card, and one thing per screen, still stands out. The rules come from Nielsen Norman Group (visual hierarchy, cards), Refactoring UI
("Hierarchy is everything", "labels are a last resort") and the Laws of UX (Von Restorff, Hick, proximity, common region).

1. **One focal point per card.** Exactly one element is loud: the name, or the one figure that matters (money, a date, a count). It is `text-title`
   (or `text-headline` for a figure that is the point) in `text-slate-50`, semibold. A distinct item only stands out when nothing else does.
2. **Three sizes, three tones.** Inside a card: title 20, body 16, small 13 (caption 12 for labels). Tones: `slate-50` for what you read,
   `slate-400` for supporting text, `slate-500` for labels and meta. Never more.
3. **Emphasize by de-emphasizing.** Quiet the neighbours instead of making the important thing louder. Labels are a last resort: a date, an amount,
   an email speaks for itself. When a label is needed it sits UNDER its value, `text-caption text-slate-500`, and the value is `text-body
   font-medium text-slate-100` (`Fact`), one step below the card's title so it never competes with it. Never a label above a value at the
   same size.
4. **Group by proximity and common region.** Related facts sit together (`Facts`), a hairline separates the parts of a card (head, facts, actions),
   and the space between groups is bigger than the space inside one.
5. **Status: one, top right, and only when it is news.** `StatusDot` with a word. Healthy states (Active, Paid) get no badge on a list already
   filtered to them. Problems carry colour AND a word: red for late or failed, amber for "check this". A problem the owner must act on is a
   `Callout` strip, at most one per card.
6. **Actions: one primary, a few quiet, the rest in More.** At most one filled orange button per card (the thing to do next). One or two quiet
   (`secondary`) buttons beside it. Everything else, and anything destructive (Ban, Cancel plan, Delete), goes in the card's **More** menu
   (`ActionMenu`), destructive last and in red, always behind a confirm. A card with only one destructive action may show it as quiet red text
   at the far left of the foot, away from the everyday buttons. Fewer choices, faster decisions (Hick). Actions sit in the card's foot
   (`CardFoot`), under a hairline, right-aligned.
7. **Links look like links only inside sentences.** A name that opens a page is a row with a chevron, or the whole card is the link. No underlined
   lists of names.
8. **Similar things are rows, not boxes.** People, payments, plans in a long list read faster as rows (name left, the one figure or status right,
   one meta line) than as a pile of equal cards. Boxes are for things that differ.
9. **Show a few, fold the rest.** Three to five items, then "Show N more". Rare details go behind a disclosure.
10. **One hero per screen.** The page's main thing is top left and biggest; everything else is visibly smaller. No ALL CAPS chips for plain facts
    (a role is a word in the meta line, not a shouting badge).

Shared pieces (`src/components/ui/CardKit.tsx`): `CardHead` (eyebrow, title, subtitle, status), `Facts` + `Fact` (value over label), `Meta`
(one quiet line joined with " · "), `Callout` (the one problem), `CardFoot` (the actions). Use them; do not rebuild them per screen.

## Band, sheet and tiles (2026-11-11, owner: whole app)

The look every main screen shares, learned from a super-app redesign the owner liked: less on the screen, the main thing first, the rest
one tap away.

1. **One band per screen** (`HeroBand`, `src/components/ui/HeroBand.tsx`): a colored sky over piano keys carrying the screen's ONE fact
   (the next class, the amount due, the streak, the count waiting). A figure is `text-hero`; its label is the small line over it. Never
   two bands on a screen, and never a band on a form, a dialog or a detail page that is mostly a list of settings.
2. **A sheet over the band's edge** holds that fact's controls: one primary button, one or two quiet ones, the rest in More.
3. **Tiles for what people do next** (`ActionTiles`): two to four soft cards with a tinted icon, a bold name and one quiet line. They
   replace rows of text links and scattered buttons. More than four choices is a list, not tiles.
4. **Do it again**: where a person repeats something (book the same time, pay the same bill, message the same person), offer the repeat
   as one tap near the top, built from what they last did.
5. **Filter inside the search**: a list with categories gets one search field with a scope chip or icon pills, not a second row of tabs.
6. **Quiet cards under it**: `rounded-card bg-neu-base shadow-raised-low`, no outlines; rows with hairlines for lists (`Hierarchy` 8).
7. Both themes, 390px and 320px wide, nothing under the dock (`pb-32`), menus never clipped by a rounded parent.

## Spacing

4-point grid. Inside a card 16 (phone) / 20 (computer); between cards 12 / 16; between page sections 32 / 48.

## Motion

150 to 200 ms for hover and press, 240 ms for things entering, the iOS curve (`ease-ios`). Reduced motion gets none.
Revamp tokens (globals.css): `--ease-move` ease-in-out for things already on screen, `--dur-menu` 180 ms (exit 80%), `--stagger` 30 ms,
`--press-scale` 0.97, `--pop-scale` 0.95, `--knob-stretch` 1.12. No bounce on everyday UI; springs only for the dock and drag release.
Shared pieces: `pop` (popovers, menus, tooltips), `stagger-item` / `StaggerList`, `knob-stretch` (Switch), `IconSwap`, `SuccessPulse`,
`MaskReveal`, `SharedLayout` (layoutId), `useRubberBand`, `useArc`. Screens reuse these; they are not rebuilt by hand.
