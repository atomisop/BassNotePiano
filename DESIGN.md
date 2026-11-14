# Design system, Bass Note Piano

The rules every screen follows. Tokens live in `src/app/globals.css` (the `@theme` block and the
"Design system" section) and `src/app/themes.css` (the per-theme ramps). Components read tokens,
never a raw hex, px size or font name.

> **Glass (2026-11-14, owner decision):** every card and every button is liquid glass, copied exactly from the 21st.dev
> "Liquid Glass Login" component. See Rule 1 in `docs/glass-revamp/DESIGN-SYSTEM.md`. This replaces the older
> "content goes solid" rule.

```text
Feeling:  a calm, flat, warm practice studio: cream linen, espresso and one burnt orange. Content first, chrome quiet.
Type:     Baloo 2 for page titles only. Inside the app everything else is the system font (SF Pro on Apple devices),
          labels in sentence case; the public pages use Sora. JetBrains Mono for keys and codes.
          Six steps: caption 12 · small 13 · body 16 · title 20 · headline 24 · hero 28 to 44 (fluid), plus one big figure for counters.
          Weights: 400 text, 500 labels, 600 titles and buttons. Tabular numbers everywhere in the app.
Colour:   three colours, 60 / 30 / 10: Cream Linen, Espresso Bean, Burnt Orange. Dark (Espresso): ground #241C18, cards one solid
          step lighter (#2F2520). Light (Linen): ground #EFE8DC, cards #FAF6EE. An 11-step warm ramp (slate-50 … slate-950).
          One accent, Burnt Orange #E8641E (signal), meaning "your next step" or "tap this": at most 3 per screen.
          States: success (emerald), warning (amber-300), danger (a crimson red, clearly apart from the orange).
Shape:    soft. 8 small controls and chips · 12 buttons' boxes, fields and rows · 16 cards · 24 sheets.
          Buttons and filter chips are full pills. No other radius.
Depth:    every card and button is liquid glass (Rule 1 in docs/glass-revamp/DESIGN-SYSTEM.md, 2026-11-14): a light tint over
          the page, bent at the rim, a bright top edge and a soft drop shadow. Buttons brighten on hover and dip to 0.98 while
          held. Things that float (menus, dialogs, sheets, the top bar) are the same glass, a little more opaque.
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

The palette is three colours used 60 / 30 / 10 (owner, 2026-11-11). Every neutral is warm: no blue-gray, no pure gray.

| Colour | Share | Values | Where it goes |
|---|---|---|---|
| Cream Linen | 60% | `#EFE8DC` (239 232 220), lighter `#FAF6EE` (250 246 238) | Linen: the page and the cards. Espresso: all text. |
| Espresso Bean | 30% | `#3B2F2A` (59 47 42), deepest `#241C18` (36 28 24) | Linen: all text, hairlines, shadows. Espresso: the page, cards (`#2F2520`), the lift and dock (`#3B2F2A`). |
| Burnt Orange | 10% | `#E8641E` (232 100 30) | The one accent: the primary button, the current tab, the next step, progress. |

The light theme (id `paper`) is **Linen**; the dark theme (id `ink`, the default) is **Espresso**. The ids and the default did not change.

| Role | Class | Linen (light) | Espresso (dark) |
|---|---|---|---|
| Page | `bg-ground`, `bg-slate-950` | `#EFE8DC` | `#241C18` |
| Card | `Card` / `glass-surface` (liquid glass, see Rule 1) | light tint over the page | white tint 0.10 over the page |
| Row or field inside a card | `glass-surface-subtle` (quieter glass) | quieter tint | white tint 0.06 |
| Text | `text-slate-50` | `#241C18` | `#FAF6EE` |
| Secondary text | `text-slate-300` / `text-slate-400` | `#3B2F2A` / `#483B34` | `#CFC5B6` / `#BAAE9F` |
| Labels and meta | `text-slate-500` (never below it for text) | `#56473F` | `#AA9E8F` |
| Hairline | `border-slate-800` | `#DED4C4` | `#42352F` |
| Accent fill | `bg-signal` + `text-signal-ink` | `#E8641E` + espresso `#241C18` | the same |
| Accent text | `text-signal-fg` | `#96320A` | `#F4884A` |
| Warning | `text-amber-300` | `#8C3C0E` | `#F5A472` |
| Danger | `text-red-400`, `bg-red-500` + white | `#A8162E`, `#BE223A` | `#FA707A`, `#D62C3E` |
| Success | `emerald-400` (ink or paper inside the app, where green is not a second accent) | `#266E3E` | `#6ECF82` |

Rules that follow from the orange's lightness:

- **The label on an orange fill is espresso** (`text-signal-ink`, 5.0:1). Cream on `#E8641E` is 3.1:1 and white 3.3:1, so neither is ever
  the label; globals.css turns a stray `text-white` / `text-slate-950` / `text-black` on `bg-signal` into the ink.
- **Orange text is `text-signal-fg`**, never the accent itself: the accent is about 3:1 on cream and under 4.5:1 on a brown card.
- **Red is crimson** (hue about 350) and the accent is hue 21, so a late bill never reads as "tap this".
- `white` and `black` in Tailwind classes are a cream white (`#FFFCF7`) and an espresso black (`#140E0B`).
- The roadmap artwork gradients (`ROADMAP_ARTWORKS`), the drawn piano keys and fretboard, photos and logo files keep their own colours.

Contrast (WCAG 2, text needs 4.5:1, large figures and edges 3:1), page / card:

| Pair | Linen | Espresso |
|---|---|---|
| `slate-50` text | 13.8 / 15.5 | 15.5 / 13.9 |
| `slate-300` text | 10.6 / 12.0 | 9.8 / 8.8 |
| `slate-400` text | 8.8 / 10.0 | 7.7 / 6.9 |
| `slate-500` text | 7.3 / 8.2 | 6.4 / 5.7 |
| `slate-600` (the faintest text tone) | 5.9 / 6.6 | 5.2 / 4.6 |
| `signal-fg` text | 6.3 / 7.1 | 6.8 / 6.0 |
| `signal-fg` on an orange-tinted card (`bg-signal/16`) | 5.9 | 4.9 |
| `red-400` text | 6.1 / 6.9 | 6.1 / 5.5 |
| `amber-300` warning text | 6.2 / 7.0 | 8.3 / 7.4 |
| espresso label on `bg-signal` | 5.0 | 5.0 |
| white label on `bg-red-500` | 5.9 | 4.8 |
| the orange fill against its ground (an edge, 3:1) | 2.8 / 3.1 | 5.0 / 4.5 |

The one figure under its bar is the orange fill on the Linen page (2.8:1 as a shape): a filled button there is always identified by its
5.0:1 label, never by its edge alone.

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
6. **Quiet cards under it**: `Card` (liquid glass, Rule 1), no outlines; rows with hairlines for lists (`Hierarchy` 8).
7. Both themes, 390px and 320px wide, nothing under the dock (`pb-32`), menus never clipped by a rounded parent.

## Spacing

4-point grid. Inside a card 16 (phone) / 20 (computer); between cards 12 / 16; between page sections 32 / 48.

## Motion

150 to 200 ms for hover and press, 240 ms for things entering, the iOS curve (`ease-ios`). Reduced motion gets none.
Revamp tokens (globals.css): `--ease-move` ease-in-out for things already on screen, `--dur-menu` 180 ms (exit 80%), `--stagger` 30 ms,
`--press-scale` 0.97, `--pop-scale` 0.95, `--knob-stretch` 1.12. No bounce on everyday UI; springs only for the dock and drag release.
Shared pieces: `pop` (popovers, menus, tooltips), `stagger-item` / `StaggerList`, `knob-stretch` (Switch), `IconSwap`, `SuccessPulse`,
`MaskReveal`, `SharedLayout` (layoutId), `useRubberBand`, `useArc`. Screens reuse these; they are not rebuilt by hand.
