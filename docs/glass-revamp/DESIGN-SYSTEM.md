# Glass design system (migration target)

Extends `DESIGN.md`. Rule 1 below is the owner's decision of 2026-11-14 and wins over any older glass wording. Reuses the existing engine
(`GlassLens`, `GlassButtons`, `liquidGlassMaps`, the `glass-*` utilities in `globals.css`). No new glass library.

## Rule 1: everything you can see or tap is liquid glass (owner decision, 2026-11-14)

The whole app uses ONE glass material: the "Liquid Glass Login" component by aakashmehra on 21st.dev
(source kept in `reference/liquid-glass-login.tsx`). Its exact values live in the shared glass utilities in
`globals.css` and in `GlassLens` / `GlassButtons` / `liquidGlassMaps`. Never style a card or button by hand.

| Layer | Examples | Surface |
|---|---|---|
| Cards | every card, tile, panel, empty state, skeleton | `glass-surface` (the 21st.dev card exactly) |
| Rows inside a card | list rows, table rows, inputs | `glass-surface-subtle` (same recipe, quieter) |
| Floating | top bar, sidebar, menus, sheets, dialogs, popovers, toasts, tooltips | `glass-surface-elevated`, `glass-surface-modal`, `glass-menu` (same recipe, a little more opaque so text stays readable) |
| Buttons | every variant of the shared `<Button>` | 21st.dev glass button. Primary is glass tinted with the signal color, destructive is glass tinted red |
| Kept solid on purpose | the `danger` button (the last can't-undo step), the piano keyboard and fretboard, the stageshow kit | solid |

The dock (`AppDock`, `.ig-dock`) keeps its owner-approved Instagram look. It is already glass; do not restyle it.

Glass takes its colors from the theme (`--c-s-*`, `signal`). It never brings in the 21st.dev colors.
Readability beats looks: if text on glass fails WCAG AA on the worst background behind it, raise that surface's tint just
enough, never drop the text contrast.

## Rule 2: every glass surface has a solid twin

- **Solid surfaces switch**: `html[data-solid-surfaces="on"]`, set before first paint from `localStorage["bnp-solid-surfaces"]`, toggled in Settings > Appearance
  with the shared `<Switch>`. When on: every glass class is opaque using the theme's surface color, `backdrop-filter` is `none`, `.lg-glass::after` is hidden, and
  `GlassLens` / `GlassButtons` do no work.
- **System preferences** switch the same twin on without a setting: `prefers-reduced-transparency: reduce` (already in `globals.css`) and `forced-colors: active`.
- A glass surface must pass contrast in BOTH looks. Text on glass is checked against the worst plausible backdrop (orange hero, white paper, black ink), not the average.
- Safari and Firefox cannot run the refraction filter. They get the same tint, rim, highlight and shadow with a plain blur, so
  the look matches as closely as the browser allows.

## Tokens (existing, kept)

`--lg-refraction`, `--lg-dispersion`, `--lg-blur` (lens strength); `--c-s-*` (theme ramp); `signal` (the one orange; orange TEXT is `text-signal-fg`).
Added by this work: `--glass-solid-bg`, `--glass-solid-border` (the opaque stand-ins, derived from `--c-s-*`, so light, dark and solid agree).

## Browser support

| Browser | Look |
|---|---|
| Chrome, Edge (Chromium) | full lens: refraction plus faint dispersion |
| Safari, Firefox | blur, saturate and the specular rim, no refraction |
| any, with reduced transparency or Solid on | opaque surface, no `backdrop-filter` |

Every phase captures Chromium, WebKit and Firefox.

## Limits

- Lens filters: at most 160 shared filters (`MAX_FILTERS`); buttons of one size share a lens.
- Backdrop-filter elements on screen: keep the count on Home and Lessons at or below the baseline in `PERFORMANCE-BASELINE.md`.
- Touch targets 24px minimum, 44px on touch (`tap`). Text 16px minimum in inputs.
- Motion: reduced-motion removes springs and the lens shimmer; keyboard actions never animate (`markKeyboardAction`).

## Selecting glass

Today `GlassButtons` finds controls by class-name fragments (`shadow-raised-low`, `.liquid`). Migration target: an explicit `data-glass` role
(`button`, `pill`, `chrome`) set by the shared `Button`, tabs and menus, with the selector kept as a fallback until every consumer is migrated and tested.
`INVENTORY.md` lists each consumer and its status.

## Evidence for every change

Before and after shots at 1440x900, 390x844 and 320x700, light, dark and Solid; axe with no serious or critical; keyboard pass; reduced-motion pass;
the three browsers; metrics compared with the baseline. `npm run glass:verify` rejects a DONE task missing any of it.
