# Glass design system (migration target)

Extends `DESIGN.md`; where they disagree on glass, `DESIGN.md` wins until the owner approves a change. Reuses the existing engine
(`GlassLens`, `GlassButtons`, `liquidGlassMaps`, the `glass-*` utilities in `globals.css`). No new glass library.

## Rule 1: glass is for things that float

| Layer | Examples | Surface |
|---|---|---|
| Floating chrome | top bar, sidebar rail, dock, command menu, popovers, sheets, toasts, tooltips | glass (lens where the browser can, blur and rim elsewhere) |
| Content | cards, rows, forms, tables, the lesson keyboard, the admin lists | solid, using theme tokens |
| Solid fills | orange primary buttons, red destructive buttons, white buttons | never lensed (`SOLID_FILL` in `GlassButtons.tsx`) |

The owner-approved Instagram-style dock keeps its look unless the owner says otherwise (see `CLAUDE.md`).

## Rule 2: every glass surface has a solid twin

- **Solid surfaces switch**: `html[data-solid-surfaces="on"]`, set before first paint from `localStorage["bnp-solid-surfaces"]`, toggled in Settings > Appearance
  with the shared `<Switch>`. When on: every glass class is opaque using the theme's surface color, `backdrop-filter` is `none`, `.lg-glass::after` is hidden, and
  `GlassLens` / `GlassButtons` do no work.
- **System preferences** switch the same twin on without a setting: `prefers-reduced-transparency: reduce` (already in `globals.css`) and `forced-colors: active`.
- A glass surface must pass contrast in BOTH looks. Text on glass is checked against the worst plausible backdrop (orange hero, white paper, black ink), not the average.

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
