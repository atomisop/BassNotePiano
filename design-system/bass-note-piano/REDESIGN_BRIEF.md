# Bass Note Piano — Redesign Brief: Dynamic Glass

**To: Claude Code, running in this repo.**
**Action: invoke the `ui-ux-pro-max` skill at full depth and execute this brief end to end.**

This supersedes `design-system/bass-note-piano/MASTER.md` completely. That file's "Modern Dark" system — flat `slate-950` background, ambient blurred color orbs, and instrument photography boxed into small `glass-card` thumbnails — is retired. Do not carry forward its Imagery section, its orb-based ambient background, or its "photo inside a card" pattern. Everything else in this brief is the new source of truth. When the rebuild is done, rewrite `MASTER.md` from scratch to document the system actually shipped — don't leave the old file in place alongside the new one.

## Why this is changing

The current site treats photography as decoration inside furniture: two instrument photos live in small `aspect-[4/3]` boxes on the marketing page, everywhere else is a flat dark surface with three blurred gradient circles behind it. It reads static and generic — glassmorphism with nothing behind the glass. Twenty-six files reference `.glass-card`/`.glass-panel`/`.glass-pill`, so this is the dominant surface across the entire product, and right now none of it has an environment.

## The new direction: Dynamic Glass

Instrument photography *is* the environment, not an inset. Every screen sits on a full-bleed photographic backdrop — piano keys, guitar strings, violin bow, a mixing board, sheet music — graded warm and desaturated, with real glass floating above it: frosted panels that pick up light and blur from the image behind them, not from a flat color. Glass should feel like an actual physical material — layered translucency, a soft specular highlight along the top edge, faint refraction at the border — rather than a flat semi-transparent box with a 1px border.

Concretely, this means:

- **Backdrops are photographs, full-bleed, fixed or scroll-linked** — never boxed, never cropped into a card smaller than its section. One dominant image per section/screen, not a gallery of thumbnails.
- **Glass surfaces float on top of the photo**, not on top of flat `bg-slate-950`. The blur (`backdrop-blur`) is doing real work here — pulling color and shape from the photo underneath — so it needs to be tuned per background, not a single fixed value everywhere.
- **A scrim sits between photo and glass** to guarantee text contrast — see Accessibility below. This is non-negotiable, not a style choice.
- **Depth is layered**, not flat: backdrop photo → scrim gradient → ambient color wash (optional, subtle) → glass surface → content. Each layer should be visually distinguishable on scroll or hover.
- **Motion has weight**: cursor-reactive tilt/glow on hero-level glass, a sheen sweep on hover for primary CTAs, parallax on backdrop photos as the page scrolls. All of it collapses cleanly under `prefers-reduced-motion` (see Motion below) — this is a hard requirement carried over from the old system, not new.

## Photography system

Reuse the three images already in the codebase and confirmed working — keep their grading direction (warm, desaturated, no visible brand logos) as the standard for anything new:

| Context | Image | Unsplash ID (verified in repo) |
|---|---|---|
| Guitar backdrop | Acoustic guitar, golden-hour light | `photo-1573603088895-d399fbee9653` |
| Violin backdrop | Close-up hand on strings, warm tone | `photo-1566913485242-694e995731b4` |

Every other screen needs its own backdrop — auth shell, the dashboard app shell, messages, billing, admin, scales. Don't reuse the same three images everywhere; source new ones. For each, search Unsplash yourself and verify the photo actually loads before committing an ID (a guessed ID that 404s is worse than no image). Match this brief for each new photo:

- Subject: piano keys/hands, guitar/violin close-ups, sheet music, a mixing board or studio mic, a metronome, vinyl — anything that reads "musical craft," nothing generic-stock-office.
- Grading: warm, slightly desaturated, cinematic — same family as the three existing images, so nothing new clashes.
- No visible third-party logos or brand marks.
- Shot wide/landscape enough to crop full-bleed at multiple aspect ratios (mobile portrait through desktop ultra-wide) without losing the subject.
- High enough resolution to sit behind a light blur at full viewport width without banding.

Assign backdrops by context, not by page — the app shell (sidebar + top bar + content area) shares one backdrop across every authenticated page so navigating between Roadmap/Lessons/Friends/Messages/Profile doesn't flash a new photo on every click. Marketing and auth each get their own, distinct from the app shell and from each other.

## Material system (replaces the old `.glass-*` utilities in `globals.css`)

Design real primitives, not one flat class reused everywhere. At minimum:

- **`.photo-backdrop`** — the full-bleed background layer: `next/image` with `fill`, `object-cover`, fixed or `sticky` positioning depending on section, plus the scrim gradient baked in as a pseudo-element or stacked div so every usage gets contrast protection automatically.
- **`.glass-surface`** — the base frosted panel (replaces `.glass-card`/`.glass-panel`): tuned `backdrop-blur`, a border that reads as a highlight on the top/left edge and a shadow on the bottom/right (real light direction, not a flat 1px all around), and a subtle inner glow.
- **`.glass-surface-elevated`** — for the one primary/highlighted element per screen (was the amber-tinted card pattern) — stronger blur, brighter edge highlight, reserved for a single element per view so it still reads as "the important one."
- **`.glass-pill`** — nav pills, chips, badges — same material language, smaller radius.
- Blur strata: functional/data-dense surfaces (admin tables, forms, messages) should use a *stronger* blur and a *stronger* scrim than marketing hero glass, so the backdrop photo stays atmospheric texture and never fights with dense text or table rows for attention. Marketing/auth hero glass can run lighter blur and let more of the photo read through.

Keep the existing color tokens (`amber-400` accent, `slate-100`/`slate-400`/`slate-600` text hierarchy, `emerald-400`/`red-400` status colors) and the `Playfair Display` + `Inter` type pairing — those aren't what's wrong here. What changes is what's *behind* the glass and how the glass itself is built.

## Motion

Carry forward the entrance pattern (fade + rise, spring `stiffness 240–260, damping 24–26`, `0.06–0.12s` stagger) — it's fine, keep using it via Framer Motion. Add, site-wide:

- Cursor-reactive tilt/glow on hero-level `.glass-surface-elevated` panels (subtle — a few degrees of tilt and a soft radial highlight following the pointer, not a gimmick).
- A one-shot sheen sweep across primary CTA buttons on hover.
- Scroll-linked parallax on `.photo-backdrop` layers (backdrop moves slower than foreground content).
- All of the above **must** collapse to the settled end-state with zero scroll-linked or pointer-linked transform under `prefers-reduced-motion` — same hard requirement as the outgoing system, don't regress it.

## Craft references — study these before building

Don't build this from imagination alone. Before writing the primitives, look at each of these and pull specific, nameable techniques from them — not their visual style wholesale, just the mechanics:

- **Apple's Liquid Glass system** (introduced 2025) — the current reference point for "real" glass in software UI: a dynamic material that visibly bends and refracts the content behind it and responds to interaction rather than sitting static. This is the bar for `.glass-surface` — if it doesn't visibly react to what's under it or how the user touches it, it's not there yet.
- **Linear** (linear.app) — the reference for restraint: every choice on the page exists to reinforce one claim (here: "fast, precise, expert-made"), aggressively high contrast, more whitespace than feels safe, one consistent motion language repeated everywhere instead of five different effects competing for attention.
- **Stripe** (stripe.com) — the reference for showing the real product instead of decorating around it. Where Stripe shows real code and real UI, Bass Note Piano should show the *actual* scale roadmap, quiz, and lesson interface — screenshots or live embeds of the real product — as hero content, not generic stock imagery standing in for the product.
- **Vercel** (vercel.com) — dark, code-forward, technical-feeling even though this isn't a dev tool; useful specifically for how it handles typography scale and grid discipline against a dark background, which maps directly onto the existing `slate-950` + `Playfair Display`/`Inter` foundation here.
- **Awwwards Site of the Day / Site of the Month winners** (awwwards.com/websites/sites_of_the_month, awwwards.com/websites/music-sound) — browse the current music/sound and portfolio categories for how leading sites handle scroll-triggered storytelling and full-bleed photographic hero sections; recent standouts worth a direct look include Jeton (scroll-based narrative flow) and the Awwwards Music & Sound collection specifically. Treat these as reference for *pacing and restraint*, not for literal 3D/WebGL complexity — this is a learning platform, not an agency portfolio, so the bar is "feels premium and alive," not "requires a loading screen."

Translate what you find into these concrete mechanics, not vague inspiration:

- **Custom/magnetic cursor** on the marketing and auth pages: primary CTA buttons and glass surfaces gently pull the cursor toward their center within a small radius, and the default cursor can subtly morph (scale/opacity shift) when hovering any interactive element — vanilla approach, no heavy library needed for this.
- **Contextual micro-interactions everywhere**, each with its own small animation, not just a global hover fade: quiz-pass success states, streak-badge unlocks, form validation errors, message-sent confirmations — each gets a distinct, purpose-built motion instead of reusing one generic transition for everything.
- **Real product visualization over stock photography where the product itself is the subject** — the marketing page's "curriculum" grid and pricing card should incorporate an actual look at the in-app roadmap/quiz UI (styled screenshot or live component reuse), the way Stripe/Linear/Vercel all lead with the real interface rather than an illustration of it.

## Full scope — every screen gets this treatment

This is a full rebuild, not a marketing-page refresh. Work through every area below:

**Marketing** — `src/app/(marketing)/page.tsx`, `classes/page.tsx` + `ClassRegistrationForm.tsx`, `pricing/page.tsx`. Replace the two boxed instrument thumbnails in the current landing page with full-bleed backdrop sections; keep the piano hero concept but let it breathe full-width instead of living in the `ContainerScroll` frame alone.

**Auth** — `src/app/(auth)/layout.tsx` and its five pages (`login`, `register`, `forgot-password`, `reset-password`, `verify-email`). One shared backdrop across the whole auth flow, form itself on a `.glass-surface-elevated` panel.

**Dashboard app shell** — `src/app/(dashboard)/layout.tsx` (replace the three gradient orbs with the shared app backdrop + scrim), `src/components/layout/Sidebar.tsx`, `TopBar.tsx`, `MobileTabBar.tsx`, `MoreSheet.tsx`, `SlideOverPanel.tsx`, `WhatsNewModal.tsx`.

**Dashboard pages** — `dashboard/page.tsx` (roadmap), `lessons/` + `LessonsClient.tsx`, `friends/` + `FriendsClient.tsx`, `messages/` + all 12 files under `messages/components/`, `profile/` + `ProfileEditor.tsx` + `ProfileEditButton.tsx`, `about/` + `AboutClient.tsx`, `account/` + `AccountSettings.tsx` + `CodeGate.tsx`, `billing/` (`curriculum/`, `history/`, `lessons/` + `LessonPurchaseFlow.tsx`), `onboarding/` + `OnboardingWizard.tsx`.

**Admin** — `admin/` layout + `page.tsx`, `bookings/`, `payments/`, `students/`, `users/`, and the components in `src/components/admin/` (`AdminBookingsQueue`, `AdminNav`, `OverviewStats`, `PaymentQueue`, `StudentQueue`, `UserManagementTable`). Denser data surfaces — lean on the stronger-blur/stronger-scrim end of the material system here so tables stay legible.

**Feature components** — `src/components/gamification/` (`BadgeGrid`, `BadgeSummary`, `StreakDots`), `src/components/progression/` (`ScaleRoadmap`, `QuizLauncher`, `QuizModal`, `ZellePaymentModal`, `ProOverrideConfirmModal`), `src/components/scales/` (`ScaleExplorer`, `KeySelector`, `ScaleChordsPanel`, `TranspositionDashboard`), `src/components/billing/ZelleUnlockGate.tsx`, `src/components/notifications/NotificationBell.tsx`.

## Accessibility & legibility guardrails (non-negotiable)

- Scrim opacity has a floor: any text sitting directly over a photo backdrop must hit WCAG AA contrast (4.5:1 body text, 3:1 large text) against the *scrim*, checked, not eyeballed.
- Visible focus ring on every interactive element — keyboard nav must keep working exactly as before.
- `cursor-pointer` on every clickable non-native element.
- No horizontal scroll at 375px, on every page in the scope list above, not just marketing.
- No emoji-as-icon — SVG only (existing `navIcons.tsx` pattern stays).
- `prefers-reduced-motion` respected everywhere motion was added, as above.

## Execution order for Claude Code

1. Build the shared primitives first — `.photo-backdrop`, `.glass-surface`, `.glass-surface-elevated`, `.glass-pill`, the scrim gradient, and a reusable `<PhotoBackdrop>` component that wraps `next/image` + scrim so every page consumes one implementation, not copy-pasted markup.
2. Source and verify new backdrop photography per context (marketing, auth, app shell, admin) before wiring it in — confirm each Unsplash URL actually resolves.
3. Roll out area by area in the order listed under Full Scope, marketing first (highest visibility), app shell + dashboard pages second, admin last.
4. Rewrite `design-system/bass-note-piano/MASTER.md` to document what actually shipped — tokens, primitives, photography assignments, motion values — replacing the retired version in full.
5. Run the build (`npm run build`) and fix anything it surfaces before calling this done.
6. Self-review at 375px, 768px, and 1440px for horizontal scroll, contrast over photos, and that every screen in scope actually got touched — don't stop at the marketing page.
