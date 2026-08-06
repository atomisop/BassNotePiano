# Bass Note Piano — Design System (Master)

**Dynamic Glass.** This replaces the retired "Modern Dark" system (flat `slate-950` background, three blurred ambient color orbs, instrument photography boxed into small thumbnails). That system is gone — nothing here carries its imagery pattern or ambient-orb background forward.

Core idea: **photography is the environment, not decoration inside furniture.** Every screen sits on a full-bleed photographic backdrop — piano keys, guitar, violin, sheet music, vinyl — graded warm and desaturated. Real glass floats above it: frosted panels that pick up light and blur from the photo behind them, not from a flat color.

Generated with the `ui-ux-pro-max` skill (which independently validated the existing Playfair Display + Inter pairing and glassmorphism direction as "elegant, editorial, luxury" — this rebuild changes what's *behind* the glass and how the glass itself is built, not the typographic/color identity). Source of truth for every page. Page-specific overrides, if ever needed, go in `pages/<name>.md` and win over this file.

## Color tokens (unchanged from before — these were never the problem)

| Token | Value | Usage |
|---|---|---|
| `--bg` | `slate-950` (#020617) | Base fallback color, page background where no backdrop is present |
| `--fg` | `slate-100` | Primary text |
| `--fg-muted` | `slate-300` / `slate-400` | Secondary text over photo backdrops (lighter than the old system — needs more contrast against imagery) |
| `--fg-faint` | `slate-500` / `slate-600` | Tertiary/meta text, only ever over the solid `bg-slate-950` base, never directly over a photo |
| `--accent` | `amber-400` (#fbbf24) | The one accent — CTAs, active states, links, prices, glow tints. No `gold-*`/`orange-*`/`yellow-*` substitutes, ever. |
| `--accent-strong` | `amber-300` (#fcd34d) | Accent hover/emphasis |
| `--positive` | `emerald-400` | Success, discounts, verified states |
| `--negative` | `red-400` | Errors, rejections |

## Typography (unchanged)

- Display/headings: `font-serif` → Playfair Display, weights 500–700.
- Body/UI: `font-sans` (default) → Inter.
- Eyebrow labels: `text-xs font-medium uppercase tracking-[0.2em] text-amber-300` (over photos) or `text-amber-400/80` (over solid backgrounds) — the recurring "kicker" pattern above section headings.

## Photography — the environment

Every backdrop is registered in `src/lib/backdrops.ts` (`BACKDROPS` object) — no page hardcodes a raw Unsplash URL. All warm, desaturated, cinematic, no visible third-party brand logos. Assigned by **context**, not by page, so navigating between pages that share a context never flashes a different photo:

| Context | Image | Where it's rendered |
|---|---|---|
| Marketing hero | B&W grand piano, hand on keys, warm bokeh | `(marketing)/page.tsx` hero section, scroll-scoped |
| Marketing — curriculum | Grand piano in an atmospheric room — distinct from the hero's close-up shot | `(marketing)/page.tsx` "The curriculum" section, scroll-scoped |
| Marketing — guitar | Acoustic guitar, golden-hour light | `(marketing)/page.tsx` "every instrument" section, scroll-scoped |
| Marketing — violin | Close-up hand on strings, warm tone | `(marketing)/page.tsx` "every instrument" section, scroll-scoped |
| Classes page | Vintage sheet music, warm prism light | `(marketing)/classes/page.tsx`, fixed for that page |
| Pricing page | Vinyl record, warm and dark | `(marketing)/pricing/page.tsx`, fixed for that page |
| Auth (all 5 screens) | Moody upright piano, dim warm room | `(auth)/layout.tsx`, fixed — shared across login/register/forgot/reset/verify so switching screens never re-flashes a photo |
| App shell (every authenticated page) | Piano keys close-up, warm, even tone | `(dashboard)/layout.tsx`, fixed — shared across dashboard/lessons/friends/messages/profile/billing/admin/everything behind auth |

Marketing pages get **multiple** backdrops (one per section, parallax-scoped to that section as the user scrolls through). Auth and the app shell each get **one** backdrop, rendered once in their layout and left alone — persistent, not re-triggered on navigation.

## Material primitives (`src/app/globals.css`, replaces the old `.glass-card`/`.glass-panel`)

- **`.glass-surface`** — the default frosted panel. `backdrop-blur-xl`, light direction is deliberate (bright highlight top/left border, soft shadow bottom/right) so it reads as an actual pane of glass, not a flat semi-transparent box with a uniform border.
- **`.glass-surface-elevated`** — reserved for the **one** primary/highlighted element per screen (was the amber-tinted accent-card pattern). Stronger blur (`backdrop-blur-2xl`), brighter edge highlight, faint amber-400 inner glow. Using it twice on the same screen defeats the point — it stops meaning "the important one."
- **`.glass-pill`** — nav pills, chips, badges, filter tags. Same material language, `backdrop-blur-md`, rounded-full.
- **Dense variant**: for admin pages and other data-dense surfaces, add `backdrop-blur-2xl` alongside `.glass-surface`/`.glass-surface-elevated` (e.g. `className="glass-surface backdrop-blur-2xl p-5"`) so the backdrop photo stays atmospheric texture and never competes with table rows or dense text for attention.

### Scrims (`.backdrop-scrim-light` / `.backdrop-scrim` / `.backdrop-scrim-dense`)

Non-negotiable, not a style choice — this is what guarantees WCAG AA text contrast (4.5:1 body, 3:1 large text) over a photo. Three strengths, set via `<PhotoBackdrop scrim="...">`:
- `light` — marketing/auth hero, let more of the photo read through.
- `standard` — default.
- `dense` — admin / data-dense surfaces; used for the app-shell backdrop specifically, since it sits behind every kind of UI including tables and forms.

All three gradients reach fully-opaque `rgba(2,6,23,1)` — exactly `bg-slate-950` — by ~80–85% down the backdrop, paired with `.backdrop-glow-smoke` (a blurred, amber-tinted radial glow layered into that opaque tail). A `<PhotoBackdrop>` section dissolves into whatever follows it — a solid section, or the next photo — instead of visibly cutting off at a hard rectangular edge. This is baked into `<PhotoBackdrop>` itself; every usage gets it for free.

### `<PhotoBackdrop>` (`src/components/ui/PhotoBackdrop.tsx`)

The one implementation every page consumes instead of copy-pasted markup. `next/image` with `fill` + `object-cover`, scrim baked in as a stacked layer, optional scroll-linked parallax (`parallax` prop — on for marketing sections, off for the persistent auth/app-shell backdrops). Always renders `absolute inset-0` — the calling code decides whether its positioned parent is `fixed inset-0` (persistent shell/auth backdrop) or a `relative` section (marketing, scoped to that section). Respects `prefers-reduced-motion` by disabling the parallax transform entirely.

## Motion

- Entrance pattern (unchanged, still correct): fade + rise, spring `stiffness 240–260, damping 24–26`, `0.06–0.12s` stagger via Framer Motion `variants`.
- **`<TiltGlow>`** (`src/components/ui/TiltGlow.tsx`) — cursor-reactive tilt + a specular highlight that follows the pointer, for hero-level `.glass-surface-elevated` panels. Small tilt range (±4–5°) deliberately — reads as a physical material reacting to light, not a gimmick. One per screen, same rule as `.glass-surface-elevated` itself. Fully inert under `prefers-reduced-motion` (tilt locks to 0, glow stops following).
- **`.cta-sheen`** — one-shot light-band sweep across primary CTA buttons on hover. Pure CSS, no JS. Apply to the single primary action per form/card, not every button. Inert under `prefers-reduced-motion` (the band never moves).
- **`<ContainerScroll>`** (`src/components/ui/container-scroll-animation.tsx`) — a scroll-linked 3D tilt/scale primitive for a floating `.glass-surface-elevated` panel. Not currently used on the homepage hero (removed — a content-light "Scale 0/1/2…" summary panel there was redundant with the full curriculum grid directly below it, and the hero reads better full-width with nothing floating on top of the photo). Still available for a future single-panel-over-photo moment. Its `offset: ["start start", "end start"]` on `useScroll` is deliberate — the default offset pairing breaks (pins the transform near its end value at rest) when the scrolling section sits at the very top of the page or is shorter than the viewport. Settles flat under `prefers-reduced-motion`.
- Marketing section backdrops parallax at a modest drift (±6%) as the page scrolls, always slower than the foreground content — never under `prefers-reduced-motion`.
- Hover: 150–300ms ease transitions on every clickable surface; `cursor-pointer` on anything clickable that isn't natively a `<button>`/`<a>`.
- Focus rings stay visible for keyboard nav everywhere — never strip `outline` without a replacement focus-visible ring.

## Layout scale (unchanged)

- Density: standard — `p-5`/`p-6`/`p-8` cards, `gap-3`/`gap-4` grids, `py-16`–`py-36` section rhythm on marketing pages (full-bleed backdrop sections run taller, `py-28`–`py-36`, to give the photo room to read).
- Max widths: `max-w-6xl` marketing sections, `max-w-3xl`/`max-w-2xl` copy-focused sections, `max-w-lg`/`max-w-sm` dashboard forms — unchanged.

## Pre-delivery checklist (applies to every page touched)

- [ ] Cards/panels use `.glass-surface` (or `.glass-surface-elevated` for the ONE primary element on that screen) — no ad-hoc `bg-slate-900 border` one-offs, no leftover `.glass-card`/`.glass-panel` references
- [ ] Every photo backdrop has a scrim; text over it hits WCAG AA contrast against the scrim, not the raw photo
- [ ] Admin/dense surfaces add `backdrop-blur-2xl`
- [ ] No emoji-as-icon — SVG only
- [ ] `cursor-pointer` on every clickable non-native element
- [ ] Hover states, 150–300ms transition; primary CTAs get `.cta-sheen`
- [ ] Focus rings intact for keyboard nav
- [ ] `prefers-reduced-motion` respected everywhere motion was added (parallax, tilt-glow, sheen, ContainerScroll)
- [ ] No horizontal scroll at 375px
- [ ] Headings use `font-serif`, body uses default sans
- [ ] Accent color is `amber-*` only
