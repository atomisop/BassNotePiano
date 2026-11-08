# Glass inventory (GL-00-01, in progress)

Snapshot: branch `dock-flash-fix`, HEAD b5a5cfaa. Counts are from grep over `src`, not from a browser run.

## Existing engine (reuse, do not add a library)
| File | Role | Notes |
|---|---|---|
| `src/lib/liquidGlassMaps.ts` (+ `tests/liquidGlassMaps.test.ts`) | Displacement and specular maps from Snell's law | Pure, tested |
| `src/lib/liquidGlass.ts` | Browser refraction helpers | To review |
| `src/components/ui/GlassLens.tsx` | Per-element lens: SVG filter plus backdrop-filter | Chromium only; elsewhere blur/saturate fallback. Per-instance ResizeObserver and per-instance map build (state in effect). Reads `prefers-reduced-transparency` once, memoised |
| `src/components/layout/GlassButtons.tsx` | Global lens for every button matching `GLASS_SELECTOR` | Selects by class substrings (`shadow-raised-low`, `h-8`, `bg-signal`...), MutationObserver on whole body (class attr), up to 160 shared filters. Fragile: styling changes silently add or drop lenses. Skips `[data-glass]`, `[data-no-lens]` |
| `src/components/ui/GlassBubbles.tsx`, `GlassSlider.tsx` | Merging control group, slider | 4 and 6 references |
| `src/app/globals.css` (3295 lines) | `.glass-surface`, `-elevated`, `-subtle`, `.glass-pill`, `.glass-menu`, `.chrome`, `.ig-dock`, `.lg-glass` | `--lg-refraction/-dispersion/-blur` tokens |
| `src/app/themes.css` | Theme ramps `--c-s-*` | |

## Usage counts (grep, `src`)
`glass-surface*` 186 lines, `backdrop-filter` 53, `backdrop-blur` 8, `GlassLens` 14, `GlassSlider` 6, `GlassBubbles` 4, `glass-menu` 4.
About 110 files touch glass, spread over auth pages, ~30 admin components, dashboard loading skeletons, lessons/booking, marketing nav and landing, dock, sidebar, profile menu, dialogs, assistant, onboarding.

## Findings so far
1. Reduced transparency: only the media query `prefers-reduced-transparency` is handled (globals.css ~1015 and ~2067). **No in-app "Solid surfaces" switch exists.** Support for the media query is partial, so this is a real gap.
2. `GlassButtons` selector-by-class is the fragile coupling the spec calls out. Migration needs explicit `data-glass` roles, one consumer at a time with tests.
3. Dispersion (RGB split) is on by default (`--lg-dispersion`); the spec forbids fringing that harms text. Needs a visual check on small labels.
4. Refraction is Chromium-only; Safari/Firefox already get blur+rim. Cross-browser baselines are needed to confirm that fallback looks right.
5. `DESIGN.md` and `CLAUDE.md` describe the dock as an exact Instagram-style bar the owner approved ("keep this look unless the owner asks"). A site-wide revamp touches that; needs explicit owner OK.
6. Memory rule from the owner: no push/PR unasked; confirm each step.

## Baselines
Public pages captured in Chromium (see STATUS.md). Home and nav already show frosted pill buttons over the hero video; the primary CTA is solid orange.

## Not yet done
Per-component table (theme states, cost, migrate choice), route matrix, baselines. These need a running app plus Playwright.

## Component migration table

Counts are files under `src` (2026-11-08). "Role" is the target from `DESIGN-SYSTEM.md`.

| Consumer | Files | Today | Target role | Phase | Status |
|---|---|---|---|---|---|
| `glass-surface` (plain) | 72 | blur, rim, tint; used for cards and floating things alike | content cards go solid; floating ones stay glass | 1 to 5 by screen | NOT STARTED |
| `glass-surface-subtle` | 20 | quieter glass on lists and rows | solid content | 1 to 5 | NOT STARTED |
| `glass-surface-elevated` | 14 | menus, sheets, popovers | glass (floating) | 1 | NOT STARTED |
| `glass-menu` | 3 | mostly opaque menu glass | glass (floating) | 1 | NOT STARTED |
| `glass-pill` | 1 | pill chips | glass or solid per place | 1 | NOT STARTED |
| `.liquid`, `.liquid-signal` (via `GlassButtons`) | 4 | lensed buttons chosen by class names | `data-glass="button"` set by the shared Button | 1 | NOT STARTED |
| `GlassLens` | `AppSidebar`, `LiquidThemeToggle`, `Dialog`, `command`, `LessonTools`, `LessonVideoPlayer` | per-instance SVG lens, Chromium only | honors Solid and reduced transparency | 1 | NOT STARTED |
| `GlassSlider`, `GlassBubbles` | `GlassSlider.tsx`, `GlassBubbles.tsx` | sliders and bubbles with a lens | honors Solid | 1, 4 | NOT STARTED |
| `.ig-dock` | `AppDock` | owner-approved Instagram-style dock | keep look; honors Solid | 1 (owner approval to touch) | NOT STARTED |
| `.chrome` (top bar) | layout | frosted bar | glass (floating) | 1 | NOT STARTED |
| `.cmd-scrim` | command menu | backdrop blur | glass | 1 | NOT STARTED |

## Baseline findings (GL-00-01)

150 screenshots over 3 sizes, light and dark, guest, student and admin, plus WebKit and Firefox on key pages. Zero horizontal overflow, zero
unexpected redirects. One capture failed to load and was skipped, not faked: `/admin/settings` at 320x700.

Axe (WCAG 2.2 AA plus best practice, first size of each run):

| Page | Rule | Impact | Nodes |
|---|---|---|---|
| `/dashboard` (dark and light) | `color-contrast` | serious | 5 |
| `/dashboard` (dark and light) | `target-size` | serious | 1 |
| `/admin/data` | `role-img-alt` | serious | 4 |

Visual defects seen: the "Add your phone number" banner covers the top bar's title and controls at 1440px; on phones the dock lensing distorts
the text of the card scrolling behind it; at 390px `/login` shows a dim second logo behind the card.
