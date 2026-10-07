# Bass Note Piano, Design System (Master)

**Editorial Paper.** This replaces the retired "Dynamic Glass" system (full-bleed photographic backdrops behind every screen, frosted `backdrop-filter` panels floating on top, near-black `slate-950` ground). That system is gone. Nothing here carries its wallpaper-photography pattern or its blur-based material forward.

Core idea: **the product is a digital companion to a printed curriculum book, so it is built like fine print.** A warm paper ground, ink text, one rust accent, and depth that comes from hairlines and a crisp white card lifted off the paper, never from blur.

Generated with the `ui-ux-pro-max` skill, which independently returned *Editorial Grid / Magazine* as the style and *"Warm ink + amber accent on cream"* as the palette for this product type, and re-validated the existing Playfair Display + Inter pairing. The typographic identity is unchanged; what changed is the **ground** (dark → paper), the **material** (glass → card), and the **role of photography** (wallpaper → subject).

## Why the palettes are overridden rather than renamed

`tailwind.config.ts` redefines the `slate` and `amber` ramps in place. The codebase already used both semantically and consistently across ~1,450 utility usages in 113 files, `slate` as the ground↔text ramp, `amber` as the single accent. Redefining the ramps converts all of them coherently instead of hand-editing every file and inevitably missing some. This is the same technique the previous system already used to turn "amber" into a dusty rose; it was extended, not invented.

Both ramps are **inverted** relative to a dark theme. In the old system a low number meant "brighter than the ground"; here it means "darker than the ground." So `text-slate-50` is still the strongest text and `bg-slate-950` is still the page, every existing className kept its intended meaning through the flip.

**Consequence to know about:** changing `tailwind.config.ts` requires a full dev-server restart. Hot reload silently serves the previous palette and you will chase a bug that isn't there.

## Color tokens

Every value is contrast-checked against the page ground `#FAF6EC`. Nothing used for text falls below WCAG AA 4.5:1.

| Token | Value | Ratio | Usage |
|---|---|---|---|
| `slate-950` | `#FAF6EC` | - | The page. Also the text colour set *on* the accent. |
| `slate-900` | `#F3EDE0` | - | Tinted panel |
| `slate-800` | `#E8E0CE` | - | Fills, borders |
| `slate-700` | `#D5CAB4` | - | Strong rule, inactive marker |
| `slate-600` | `#736A5E` | 5.0:1 | Faintest text that still passes AA |
| `slate-500` | `#655C51` | 6.1:1 | Meta |
| `slate-400` | `#574F45` | 7.5:1 | Secondary |
| `slate-300` | `#453E36` | 9.9:1 | Body |
| `slate-200` | `#35302A` | 12.3:1 | Strong body |
| `slate-100` | `#262119` | 14.8:1 | Primary text |
| `slate-50` | `#1A150F` | 17.1:1 | Display headings |
| `amber-400` | `#A04E1E` | 5.4:1 | **The accent.** Works as a fill (paper text on it) and as text (on paper) at the same ratio, which is what lets `bg-amber-400` and `text-amber-400` both stay legible. |
| `amber-300` | `#7F3D14` | 7.6:1 | Hover (darker), eyebrow text |
| `amber-200/100` | `#6B330F` / `#5A2A0C` | 9.3 / 11.0:1 | Inline emphasis |
| `amber-500` | `#C2691F` | - | Decorative gradient stops only |
| `emerald-400` | `#1F7A45` | 5.0:1 | Success, as fill and as text |
| `red-400` / `red-500` | `#B32318` / `#C2321F` | 6.1 / 5.2:1 | Error, destructive fill |
| `ink` | `#1A150F` | - | Hairlines and tints, via `ink/5`-`ink/60`. Replaces the old `white/N` alphas, which are invisible on paper. |

## Typography (unchanged)

- Display/headings: `font-serif` → Playfair Display, weights 500-700.
- Body/UI: `font-sans` → Inter.
- Eyebrow: use the `.eyebrow` class, not a hand-rolled `text-xs uppercase tracking-…` each time.

## Material primitives (`src/app/globals.css`)

**There is no `backdrop-filter` anywhere in this system, by design.** The previous system's blur sat on every card, in every scrollable list, and was the single largest scroll cost in the app, it had already been walked back once for jank. Paper has no such cost.

- **`.glass-surface`**, the default surface: a crisp white card on warm paper. Elevation comes from the tonal step between `#FFFFFF` and `#FAF6EC` plus a tight warm shadow. (Name kept so the ~78 existing usages didn't all need touching.)
- **`.glass-surface-elevated`**, the ONE primary element per screen. Distinguished by an accent hairline and a slightly deeper lift, not a different material. Using it twice on a screen stops it meaning "the important one."
- **`.glass-pill`**, chips, nav pills, filter tags, badges.
- **`.rule`**, full-measure hairline, the way a rule separates sections in print.
- **`.eyebrow`**, the recurring kicker above a heading.

Borders and shadows on these three surfaces are raw `rgba`, not Tailwind opacity utilities: this project has a reproducible quirk where some arbitrary opacity modifiers compile to nothing, and these classes back every surface in the app.

## Photography, the subject, never the bed

The old system wallpapered every screen, including the whole authenticated app, with a piano photo. On paper that reads as a smudge under the text, and it forced a heavy scrim that muddied every surface above it. Now:

- **App shell and auth: no photographic backdrop at all.** Removed from `(dashboard)/layout.tsx` and `(auth)/layout.tsx`.
- **Marketing pages keep `<PhotoBackdrop>`,** but the scrims are far stronger than the dark system's. On a dark page, light text over a lightly-veiled photo is legible because the photo's midtones are darker than the type. Inverted, that stops being true, ink text over a half-visible photo lands on whatever tone happens to sit behind each glyph. So the photo is pushed to a ghost the type sits on, never competes with.
- Anything that must be genuinely dark regardless of theme, a phone bezel, the onboarding spotlight scrim, is hardcoded, not tokenised. A phone chassis is a real object, not a themed surface.

### Exception: the homepage is a scroll-driven film (2026-08-11)

The rule above, media as subject, never as bed, **no longer holds for `/`**. The homepage's ground is now a single piece of studio footage in `<ScrollVideoBackground>`, fixed to the viewport, with the page's scroll progress driving the playhead instead of playback. `<PhotoBackdrop>` was removed from that route entirely; every other marketing page still follows the rule as written.

This is a deliberate override, not drift, and it survives the original objection for one reason: the objection was about *contrast roulette*, type landing on whatever tone happens to sit behind each glyph. That is answered by measurement rather than by avoidance. The clip is sampled frame by frame for its brightest pixel (`rgb(243,223,191)`), and protection is set against that worst case rather than the average frame.

### Two-layer protection, not one wash

The first implementation used a single flat 84% scrim. The number was correct for a single global layer, but the shape was wrong: it spent the contrast budget over the whole frame, including the large regions carrying no text, which veiled the footage everywhere and made a 4K source look soft. Protection is now split:

1. **A light base tint** (`bg-slate-950/60`) that only keeps midtones in range.
2. **`<TextShelf>`**, a local pool (`pool`) or edge ramp (`edge`) of shade under each block of type, falling off to nothing at its edges. This does the AA work.

The result is vivid footage in the open and guaranteed contrast under type. This mirrors the reasoning already applied to photographs in `.backdrop-scrim-vignette`: ask where text actually touches the image instead of protecting the whole frame.

Rules for anything built on top of it:

- **Body copy over footage is `slate-300` or lighter**, and sits on a `<TextShelf>` or inside a filled card. `slate-400` fails against the worst frame.
- **Cards over footage carry their own fill** (`bg-slate-950/68`), because a near-transparent card lets highlights travel through the text and makes contrast vary frame to frame, unmeasurable by definition.
- **Never stack three opaque layers** (base tint + stage wash + shelf). That flattens the image to black, which is the failure this system exists to avoid.

### Encoding requirements for any replacement clip

- **H.264, 8-bit** (`-pix_fmt yuv420p`). HEVC does not decode in Firefox, and the 10-bit master decodes almost nowhere.
- **Short GOP** (`-g 6 -bf 0`). Seeking a normal GOP measured ~538ms per seek against a 16.7ms frame budget, a slideshow. `-g 6` measured 6.9ms, `-g 1` 5.2ms; the size saving of `-g 6` is worth the 1.7ms.
- **60fps, interpolated if the source is lower** (`minterpolate=fps=60:mi_mode=mci`). For scrubbing, what matters is *frames per scroll-pixel*: 24fps over this page is ~27px of scroll per frame and reads as stepping. 60fps is ~11px.
- **~2560px wide.** Retina displays render a full-bleed background at roughly 2× CSS pixels, so a 1440px encode visibly softens.
- Re-measure the brightest pixel and re-check contrast after any swap.

## Layout & hierarchy rules

- **Lists are one card with divided rows**, not a stack of separate floating cards. Seven identically-shadowed pills read as seven equally-urgent things.
- **Group long lists by the unit the reader plans in**, the class schedule groups by "This week / Next week / Later"; booking history groups by month.
- **One solid accent fill per screen, maximum.** Repeated solid-accent buttons down a page make the accent mean nothing; secondary actions use the outline treatment (`border-amber-400/40 text-amber-300`).
- **A card's primary action must look like a control**, bordered, with an arrow if it navigates. Not a bare coloured word.

## Motion

- Entrance: fade + rise, spring `stiffness 240-260, damping 24-26`, `0.06-0.12s` stagger via Framer Motion variants.
- `<TiltGlow>`, cursor-reactive tilt with a warm rust wash (a light-on-light highlight is invisible on a white card). One per screen.
- `.cta-sheen`, one-shot warm light band across the single primary CTA per form/card.
- Marketing backdrops parallax at ±6%, never under `prefers-reduced-motion`.
- Hover 150-300ms on every clickable surface; focus rings always intact.

## Verification notes

- **Screenshot with Playwright, not the in-app preview pane.** That pane does not run framer-motion's mount animations, so `initial="hidden"` content photographs as blank and looks like a rendering bug. Playwright renders it correctly.
- For full-page captures, scroll the page first so `whileInView` sections animate in, otherwise the capture shows holes where those sections are.

## Pre-delivery checklist

- [ ] Cards use `.glass-surface` (or `.glass-surface-elevated` for the ONE primary element), no ad-hoc `bg-white border` one-offs
- [ ] No `backdrop-filter` anywhere
- [ ] No `white/N` alphas, hairlines are `ink/N`
- [ ] Text tokens only from the table above; nothing lighter than `slate-600` used for text
- [ ] At most one solid `bg-amber-400` action per screen
- [ ] No emoji-as-icon, SVG only
- [ ] `cursor-pointer` on every clickable non-native element
- [ ] Hover states, 150-300ms; focus rings intact
- [ ] `prefers-reduced-motion` respected
- [ ] No horizontal scroll at 375px
- [ ] Headings `font-serif`, body default sans
- [ ] Accent is `amber-*` only
