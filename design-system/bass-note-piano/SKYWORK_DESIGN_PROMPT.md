# Skywork.ai, Bass Note Piano Design Foundation Prompt

> Paste everything below the line into Skywork.ai as one prompt. If it truncates or the run
> gets thin near the end, run §7 "Batch plan" as separate follow-up prompts instead.

---

You are a senior product designer and front-end engineer. Design and build the **complete visual
foundation** for a real, shipping web app called **Bass Note Piano**, every screen, every
component, every button state, every animation.

## 0. What I want back

Build a **self-contained, clickable static design prototype**, pure HTML + CSS + vanilla JS,
no backend, no build step, no external UI framework. It must:

- Cover **every screen listed in §5** as its own page, with working navigation between them.
- Use **realistic placeholder content** (real-sounding names, dates, prices, scale names from §1).
  Never `Lorem ipsum`, never `[Button]`, never an empty state that says "content goes here".
- Ship a **`tokens.css`** at the root holding every colour, font, radius, shadow, spacing and
  timing value as a CSS custom property. Every other stylesheet reads from it, no hardcoded hex
  anywhere else.
- Ship a **`components.html` style-guide page** that shows every component in every state
  side by side (all button variants × default/hover/active/focus/disabled/loading/success, all
  input states, all card types, all badges, all toasts, the full type scale, the full colour ramp).
- Include a short **`DESIGN-NOTES.md`** explaining the decisions: why each animation timing,
  what each token is for, and any place you deviated from this brief and why.

Everything must work at **375px, 768px, 1280px and 1600px** with no horizontal scroll at any width.

This prototype gets ported into a Next.js 14 + Tailwind + Framer Motion codebase afterwards, so
keep the structure clean and the class naming systematic (BEM-ish or utility-ish, just be
consistent). Write the animations so their timing values are legible and tweakable, not buried.

## 1. The product

**Bass Note Piano** teaches the Ethiopian *kiñit* system, traditional Ethiopian scales, rhythm and
chords, as a paid online curriculum that acts as the digital companion to a printed curriculum
book. Built around piano/keyboard, but the theory is explicitly instrument-agnostic (guitar,
violin, bass players are a real part of the audience).

**Business model:** one-time **$69.99** unlocks the entire 6-scale curriculum for life. No
subscription. Optional add-on: **$34.99 per 30-minute live 1:1 lesson** (Online or In-Person), **20%
off when booking 2 or more**.

**The 6 scales** (use these exact names as content everywhere):

| # | Title | Kiñit name | Formula |
|---|---|---|---|
| Scale 0 | Diatonic, Chromatic & the Seven Modes | - | 1-2-3-4-5-6-7 |
| Scale 1 | Major Pentatonic | Tizita Major | 1-2-3-5-6 |
| Scale 2 | Minor Pentatonic | Bati Minor | 1-b3-4-5-b7 |
| Scale 3 | Bati, Major, Minor & Lydian | Bati | 1-3-4-5-7 |
| Scale 4 | Anchihoye & Anchihoye Dorian | Anchihoye | 1-b2-4-b5-6 |
| Scale 5 | Mixolydian Pentatonic & Minor Pentatonic | Mixolydian Pentatonic | 1-2-4-5-6 |

**Three audiences share the app:** logged-out visitors (marketing), students (dashboard,
curriculum, lessons, messaging, billing), and a single admin (approval queues and content
management).

## 2. Visual identity, "Editorial Paper"

The governing idea: **the product is a digital companion to a printed book, so build it like fine
print.** A warm paper ground, ink text, one rust accent. Depth comes from **hairlines and a crisp
white card lifted off the paper**, never from blur. Think a beautifully set music textbook that
happens to be interactive, not a SaaS dashboard.

**There is no `backdrop-filter` / frosted glass anywhere in this system.** If you reach for blur
as a material, you have misread the brief.

### Colour, use these exact values

| Role | Hex | Notes |
|---|---|---|
| **Paper** (page ground) | `#FAF6EC` | The base of every screen |
| Panel (tinted) | `#F3EDE0` | Recessed / grouped areas |
| Card | `#FFFFFF` | The lifted surface |
| Fill / border | `#E8E0CE` | |
| Strong rule | `#D5CAB4` | Dividers, inactive markers |
| Text, faintest | `#736A5E` | Absolute floor for text. Nothing lighter, ever. |
| Text, meta | `#655C51` | Timestamps, captions |
| Text, secondary | `#574F45` | |
| Text, body | `#453E36` | |
| Text, strong body | `#35302A` | |
| Text, primary | `#262119` | |
| **Ink** (display headings) | `#1A150F` | Also the hairline colour, used at 5-60% alpha |
| **Rust** (THE accent) | `#A04E1E` | Works as a fill *and* as text, both stay legible on paper |
| Rust, hover/darker | `#7F3D14` | Also eyebrow text |
| Rust, emphasis | `#6B330F` / `#5A2A0C` | Inline emphasis |
| Rust, decorative | `#C2691F` | Gradient stops only, never text |
| Success | `#1F7A45` | As fill and as text |
| Error | `#B32318` / destructive fill `#C2321F` | |

Every text colour above is contrast-checked against `#FAF6EC` at **WCAG AA 4.5:1 minimum**. Do not
introduce new colours. Do not introduce a second accent. If you need another distinction, use
weight, size, rule, or space, not a new hue.

**Hairlines are ink at low alpha** (`rgba(26,21,15,0.08)` etc.), never white alphas, white is
invisible on paper.

### Typography

- **Display / headings:** Playfair Display, weights 500-700. Every heading is serif.
- **Body / UI:** Inter. Everything else.
- **Eyebrow:** one reusable class, small, uppercase, letterspaced, rust `#7F3D14`. Define it once
  and use it everywhere a kicker sits above a heading. Never hand-roll it per section.
- Build a real type scale in `tokens.css` (display / h1 / h2 / h3 / body-lg / body / small /
  eyebrow) with line-heights, and use it. No arbitrary font sizes at call sites.
- Long-form copy sets to a comfortable measure (~65-75ch), like a book page.

### Material primitives, define these four, use nothing else

1. **`.surface`**, the default card. Crisp white `#FFFFFF` on the warm paper ground. Elevation
   comes from that tonal step plus a **tight warm shadow** (e.g. `0 1px 2px rgba(26,21,15,.04),
   0 8px 24px rgba(26,21,15,.06)`) and a hairline border.
2. **`.surface-elevated`**, the **ONE** primary element per screen. Same material, distinguished
   by a **rust hairline** and a slightly deeper lift. Using it twice on a screen destroys its
   meaning. Enforce one per page.
3. **`.pill`**, chips, nav pills, filter tags, badges.
4. **`.rule`**, a full-measure hairline, used the way a rule separates sections in print.

### Layout rules that are not optional

- **Lists are ONE card with divided rows**, not a stack of separate floating cards. Seven
  identically-shadowed pills read as seven equally-urgent things.
- **Group long lists by the unit the reader plans in**, schedules group by "This week / Next week /
  Later", payment history groups by month.
- **One solid rust fill per screen, maximum.** Secondary actions use the outline treatment.
- **A card's primary action must look like a control**, bordered, with an arrow if it navigates.
  Never a bare coloured word.
- Generous vertical rhythm between sections. Editorial spacing, not dense-dashboard spacing.

### Photography

Photography is **the subject, never the bed.** No full-bleed photo wallpaper behind the app shell
or auth screens, on a paper ground that reads as a smudge under the type. Marketing pages may use
photography (piano keys, sheet music, hands on keys, a violin, vinyl) but always with the type
sitting on a **local pool of shade under that specific text block**, falling off to nothing at its
edges, never one flat wash over the whole image.

**Homepage is the single exception** (see §5.1).

## 3. The component foundation

Design each of these properly, and show every state in `components.html`.

### 3.1 Buttons, the centerpiece, spend real effort here

Five variants:

| Variant | Treatment | Use |
|---|---|---|
| **Primary** | Solid rust `#A04E1E`, paper-coloured text `#FAF6EC` | One per screen |
| **Secondary** | Transparent, rust border at ~40% alpha, rust text `#7F3D14` | Everything else |
| **Ghost** | No border, ink text, tinted hover | Tertiary / in-table actions |
| **Destructive** | Solid `#C2321F`, paper text | Delete, reject, cancel |
| **Link** | Rust text with an underline that draws in from the left on hover | Inline navigation |

Sizes: `sm` (32px), `md` (40px), `lg` (48px). Full-width variant for forms and mobile.

Every button must have all of these, and I want them to feel *considered*, not generic:

- **Hover:** 150-300ms transition. Rust darkens to `#7F3D14`; the shadow lifts ~2px.
- **Press:** a real physical press, scale to `0.97` with a fast spring, shadow collapses. It
  should feel like pressing a key.
- **Focus-visible:** an offset rust ring, 2px, always present and never removed. Keyboard users
  must be able to traverse every screen.
- **Sheen:** the *single* primary CTA on a page gets a **one-shot warm light band** that sweeps
  diagonally across it on mount (and again on hover), roughly 700ms, easing out. Subtle, a
  highlight passing over ink, not a glare.
- **Magnetic hover:** primary CTAs pull toward the cursor within ~24-32px of their bounds using a
  spring (`stiffness 200, damping 20`), and release back to center. **Marketing and auth pages
  only**, never in the dashboard, where it's a liability over dense tables.
- **Arrow slide:** any button that navigates carries a `→` that slides ~4px right on hover.
- **Loading state:** the label crossfades to a small spinner *without the button changing width*,
  no layout shift. Width is locked at the widest of label/loading/success.
- **Success state:** the spinner morphs into a checkmark that draws itself (SVG stroke-dashoffset),
  holds ~1.2s, returns to label.
- **Disabled:** reduced contrast, `cursor: not-allowed`, no hover, no motion.

Also design: **icon buttons** (square, 40px, ghost by default), **segmented pill toggles** (the
selected segment slides between positions rather than snapping, animate the indicator, not the
background), and a **magnetic cursor** for marketing/auth: the system cursor stays, but a small
soft companion dot follows with spring lag and scales up over anything interactive. No cursor
effect on touch devices, gate it behind `(hover: hover) and (pointer: fine)`.

### 3.2 Everything else

- **Inputs / textareas / selects:** paper-tinted fill, hairline border, rust border + ring on
  focus. Floating or fixed label, pick one and hold it. Helper text and error text slots that
  don't shift layout when they appear.
- **Error state with motion:** a short horizontal shake on the field plus a border flash to
  `#B32318`, auto-clearing on the next valid keystroke.
- **Pill-select groups** (used for instrument and skill-level pickers): rounded pills, selected
  gets rust border + rust text, unselected is hairline + secondary text.
- **Checkbox / radio / toggle:** custom, with a drawn check and a spring thumb on the toggle.
- **Cards:** default `.surface`, plus a "row card" for lists (one card, divided rows, each row
  hoverable with a tinted background and a rust chevron).
- **Progress:** a linear rail and a circular ring, both rust on `#E8E0CE`, both animating from 0 on
  mount.
- **Badges / status chips:** rust (pending), green (approved/complete), red (rejected), neutral
  (locked).
- **Modal / sheet:** always over a dark scrim (an overlay's job is to push the page back, so it
  stays dark even though the app is light). Scales in from 0.96 with a fade; the scrim fades
  independently and slightly faster. Mobile version is a bottom sheet that drags to dismiss.
- **Toast:** slides up from the bottom-right (bottom-center on mobile), auto-dismisses at 4s with a
  thin rust progress line draining along its bottom edge.
- **Tables (admin):** hairline-divided, sticky header, zebra-free, row hover tint, right-aligned
  actions, sortable column headers with an animated caret.
- **Nav:** a desktop top bar for marketing; for the app, a left sidebar on desktop that collapses
  to a bottom tab bar on mobile. Active item marked with a rust rule and weight, not a filled
  block.
- **Empty states:** every list gets a real one, a small line drawing, one sentence of copy, one
  action. Write the actual copy.
- **Skeletons:** paper-toned, with a slow shimmer, matching the exact shape of the content they
  replace.
- **Avatars, tooltips, dropdown menus, tabs, accordion, pagination, breadcrumbs, date picker,
  file dropzone**, design each, in every state.
- **No emoji as icons, anywhere.** SVG only, one consistent stroke weight (1.5px), one family.
- `cursor: pointer` on every clickable non-native element.

## 4. Motion system

One motion language, not five competing effects. Define every value in `tokens.css`.

- **Entrance:** fade + rise, spring-feeling (`stiffness 240-260, damping 24-26` equivalent), with a
  **0.06-0.12s stagger** between siblings. Sections animate in as they scroll into view, once.
- **Reward moments get a snappier spring** (`stiffness ~300, damping ~15`) with a slight overshoot,
  reserved for badge unlocks, quiz passes, and confirmed payments. These three should feel like the
  same visual family; do not invent a separate celebration for each.
- **Numbers count up** rather than appearing, quiz scores, prices, streak counts, admin stats.
- **Hover:** 150-300ms on every clickable surface.
- **Page transitions:** a fast paper-toned wipe or a crossfade, ~300ms. Nothing that delays reading.
- **Tilt:** one cursor-reactive tilt element per screen, maximum, with a **warm rust wash** as the
  highlight (a light-on-light highlight is invisible on a white card).
- **Scroll parallax** on marketing backdrops at ±6% maximum. Restraint.
- **Micro-interactions with distinct, purposeful animation:** quiz passed (score counts up + a brief
  rust glow pulse on the result card), badge unlocked (spring overshoot scale-in), streak milestone
  (the newly-filled dot pulses, distinct from an instant colour swap), message sent (bubble rises
  and settles), form error (the shake above), payment confirmed (same celebration language as quiz
  pass, reused, not reinvented).
- **`prefers-reduced-motion` collapses everything to its instant end state.** No exceptions, no
  "but this one is subtle". Build this in from the start rather than bolting it on.

## 5. Every screen to design

### 5.1 Marketing (logged out)

**`/` Homepage, the one screen that breaks the rules above.** Its ground is a single piece of
studio footage (piano performance) fixed to the viewport, where **scroll position drives the video
playhead** rather than playback. Over it sits a **center-pinned scrollytelling spine**: a tall
wrapper (~440vh) containing a `position: sticky` 100vh scene lock, with a piano keyboard as the
pinned canvas and copy blocks alternating between left and right grid columns as you scroll. Text
protection is two-layer, a light base tint over the whole frame, plus a **local pool of shade
directly under each text block**, falling off at its edges. Cards over footage carry their own
fill; never stack three opaque layers or the footage flattens to black. Quality benchmark:
**Linear** (hairline borders, grid segmentation), **Chronicle** (bento elements morphing on
scroll), **Breakthrough Energy** (center-pinned media, margin copy fading at the edges),
**MakeMePulse** (typography pairing, vast negative space, kinetic hover). Sections: session-aware
nav → hero (eyebrow "Only $69.99 · Lifetime access", headline "Ethiopian Scales, Rhythm & Chords" with
"Rhythm" in rust, primary + secondary CTA) → a real static preview of the in-app curriculum roadmap
(show the actual product, Stripe-style, not just mood photography) → the full 6-scale grid → guitar
section → violin section → closing $69.99 pricing callout → footer.

**`/pricing`**, "One price. Every scale. Forever." One `.surface-elevated` curriculum card ($69.99,
three benefits, "Unlock the curriculum"), then a live-lessons explainer with a worked discount
example ($34.99 each, 20% off 2+) and "Buy lesson credits". Animated tier grid; price counts up.

**`/classes`**, in-person lead capture, no login. Header "Learn with us in person." Fields in
order: Full name*, Email*, Phone*, Instrument (pill-select: Piano/Keyboard, Bass, Guitar, Drums,
Vocal, Other), Skill level (pill-select: Beginner, Intermediate, Advanced), Notes. Button
"Request to register" → "Submitting…". Success replaces the form with a thank-you state. Also
include a **month-grid calendar** for picking a session.

**`/terms`**, long-form legal, set like a book page. Sticky section index on the left at desktop.

**`/about`**, the story of the curriculum and the teacher.

### 5.2 Auth

`/register`, `/login` (a **two-step wizard**, email, then password/2FA code), `/verify-email`
(6-digit code entry, one box per digit, auto-advance and paste support), `/forgot-password`,
`/reset-password`. No photographic backdrop on any of these, paper ground, one centered
`.surface-elevated` card, the product wordmark above it. Every one of these needs: inline
validation, the error shake, the loading→success button morph, and a clear path back.

**`/onboarding`**, a multi-step wizard collecting primary instrument, skill level, genres
(multi-select: Jazz, Classical, R&B, Rock, Pop, Gospel) and learning goal. Progress indicator that
fills between steps; each step slides in horizontally.

### 5.3 Student app

- **`/dashboard`**, the roadmap. The 6 scales as a **vertical journey** with clear locked /
  in-progress / complete states, a rust connector line drawing itself between completed nodes, plus
  a streak display and a badge summary. This is the emotional center of the product; make it the
  best screen in the set.
- **`/scales/[slug]`**, the course player. Video area, a lesson list, a PDF download, a practice
  checkbox, and a quiz launcher. Below it, an **interactive scale explorer**: a playable keyboard
  that highlights the scale's notes in every key, showing correct spelling and the mapped chords.
- **`/lessons`**, book a live 1:1 lesson. Credit balance, calendar, time-slot picker,
  Online/In-Person toggle, upcoming and past bookings.
- **`/billing/curriculum`**, the $69.99 unlock.
- **`/billing/lessons`**, buy lesson credits, with the 20% bundle discount shown live as quantity
  changes.
- **`/billing/history`**, payments grouped by month, one card with divided rows, status chips.
- **`/messages`**, a conversation list plus a chat window; DMs and group chats; typing indicator;
  message bubbles that rise and settle on send; pinned conversations.
- **`/friends`**, friend list, incoming/outgoing requests, search, block.
- **`/profile`**, name, username, avatar upload with cropper, instrument/level/genres.
- **`/account`**, email, password change, 2FA, trusted devices, login history, and four separate
  email-notification toggles (Payments / Role updates / Social / Reminders).

Every one of these sits inside the app shell: sidebar (desktop) / bottom tabs (mobile), a top bar
with a notification bell that has an unread dot and a dropdown panel, and an avatar menu.

### 5.4 Admin

`/admin` (overview with stat tiles whose numbers count up), `/admin/payments` (approve/reject
queue), `/admin/bookings`, `/admin/students` (class registrations), `/admin/users` (role
management), `/admin/lessons` (upload video/PDF course content, with a dropzone and progress),
`/admin/credits`, `/admin/messages`, `/admin/announcements`. All share an admin sub-nav in that
order. Dense but still editorial, same tokens, same components, tighter spacing, more table.

## 6. Acceptance checklist, I will check every one of these

- [ ] Every colour comes from `tokens.css`. Zero hardcoded hex outside it.
- [ ] No `backdrop-filter` anywhere.
- [ ] No white-alpha hairlines, hairlines are ink at low alpha.
- [ ] No text lighter than `#736A5E`. All text passes AA against `#FAF6EC`.
- [ ] At most one solid rust button and one `.surface-elevated` per screen.
- [ ] Headings are Playfair Display; body is Inter. No third typeface.
- [ ] No emoji used as an icon. SVG only, consistent stroke weight.
- [ ] `cursor: pointer` on every clickable non-native element.
- [ ] Hover states 150-300ms; focus rings present and never removed.
- [ ] `prefers-reduced-motion` collapses every animation to its end state.
- [ ] No horizontal scroll at 375px on any page.
- [ ] Lists render as one card with divided rows, not stacks of floating cards.
- [ ] Every list has a real, written empty state.
- [ ] Every button shows loading and success without changing width.
- [ ] `components.html` shows every component in every state.

## 7. Batch plan

If you can't do all of this in one pass, do it in this order and tell me where you stopped:

1. **Foundation**, `tokens.css`, type scale, the four material primitives, the full button system,
   all form controls, `components.html`. *Nothing else starts until this is solid.*
2. **Marketing**, homepage (the scrollytelling spine), pricing, classes, terms, about.
3. **Auth + onboarding**, all six screens plus the wizard.
4. **Student app**, dashboard roadmap, course player + scale explorer, lessons, billing ×3,
   messages, friends, profile, account, and the app shell.
5. **Admin**, all nine screens.

Do not skip ahead, and do not thin out the last batch to finish faster. If you have to choose,
give me fewer screens at full quality rather than all of them half-designed.

---

## Porting notes (for me, not for Skywork)

When Skywork's output comes back, it maps onto this codebase as follows, the Tailwind ramps here
are **inverted**, where a *low* number is the strongest text and a *high* number is the page ground:

| Prompt name | Hex | Tailwind token in this repo |
|---|---|---|
| Paper | `#FAF6EC` | `slate-950` |
| Panel | `#F3EDE0` | `slate-900` |
| Fill/border | `#E8E0CE` | `slate-800` |
| Strong rule | `#D5CAB4` | `slate-700` |
| Faintest text | `#736A5E` | `slate-600` |
| Body text | `#453E36` | `slate-300` |
| Primary text | `#262119` | `slate-100` |
| Ink / display | `#1A150F` | `slate-50`, and `ink` for hairlines |
| Rust accent | `#A04E1E` | `amber-400` |
| Rust hover | `#7F3D14` | `amber-300` |
| Success | `#1F7A45` | `emerald-400` |
| Error | `#B32318` | `red-400` |

`.surface` → `.glass-surface`, `.surface-elevated` → `.glass-surface-elevated`, `.pill` →
`.glass-pill`, `.rule` → `.rule`, eyebrow → `.eyebrow` (all already defined in `globals.css`; the
`glass-` names are historical and kept so ~78 existing usages didn't need touching).

Springs port to Framer Motion `type: "spring"` with the same stiffness/damping. The sheen is
`.cta-sheen`. Remember: **changing `tailwind.config.ts` requires a full dev-server restart**, hot
reload silently serves the previous palette.
