# Liquid glass everywhere (2026-11-14)

The owner's brief: every card and every button in the app uses the exact glass of the 21st.dev "Liquid Glass Login"
component by aakashmehra (MIT; source kept unchanged in `reference/liquid-glass-login.tsx`), `/login` and `/register`
share the photo `public/auth/login-bg.jpg` under that card, and the slide-over Log in panel is gone. Rules:
`docs/glass-revamp/DESIGN-SYSTEM.md` Rule 1.

## The 21st.dev recipe (every value)

**Map.** `computeDisplacementData`: signed distance to a rounded box; a phi table that integrates the Snell's-law bend
(refractive index 1.5) of a squircle dome slope across the bevel; displacement = the gradient of phi times `gain` 1.35,
capped to -1..1. Light from `{ x: -0.55, y: -0.85 }` (normalised). Channels: R = horizontal bend, G = vertical bend,
B = rim specular (`max(0,dot) + max(0,-dot) * 0.35`, times the rim fraction), A = shape. 128 = no shift. Rendered at
`min(devicePixelRatio, 2)`, encoded as a PNG blob URL (WebKit refuses data URIs in `feImage`).

**Filter.** `buildFilterSvg`: region padded by `ceil(scale + aberration + 4)` px each side; `feImage` the map at the
element's pixel size; three `feDisplacementMap` passes (red at `scale + aberration`, green at `scale`, blue at
`scale - aberration`), each isolated with `feColorMatrix`, screen-blended; then `feGaussianBlur stdDeviation = frost`.
A fresh filter id every rebuild (browsers cache filter output by id).

**Backdrop by mode.**

| Mode | When | backdrop-filter | Background |
|---|---|---|---|
| Refract | Chromium, map ready | `url(#f) blur(0.5px) saturate(1.85) brightness(1.02)` | `rgb(255 255 255 / tint)` |
| Loading | Chromium, before the map | `blur(10px) saturate(1.6) brightness(1.04)` | `rgb(255 255 255 / tint)` |
| Simple | Safari, Firefox, no `url()` backdrop | `blur(16px) saturate(1.8) brightness(1.05)` | gradient white/25 to white/10, inset ring white/35 |
| Opaque | reduced transparency | none | solid |

**Per element.**

| Element | radius | bevelDepth | scale | aberration | frost | tint | shadow |
|---|---|---|---|---|---|---|---|
| Card | 32 | 56 | 72 | 16 | 0.4 | 0.10 | `0 30px 80px rgb(0 0 0/0.4), inset 0 1px 0 rgb(255 255 255/0.6), inset 0 -1px 0 rgb(255 255 255/0.15)` |
| Button | pill (26) | 22 | 48 primary, 36 others | 14 | 0.4 | 0.12 (replaced by the colour below) | `0 8px 24px rgb(0 0 0/0.28), inset 0 1px 0 rgb(255 255 255/0.55)` |
| Field | 16 | 22 | 36 | 10 | 0.4 | 0.06 | none; the input `bg-black/15`, inset ring white/12, hover white/20, focus `bg-black/20` + 2px white/60 |

Buttons: primary colour `rgb(255 128 56 / 0.34)`, others `rgb(255 255 255 / 0.07)`; hover overlay white/10, press
white/15 and scale 0.98; label text shadow `0 1px 8px rgb(0 0 0/0.35)`; focus ring 2px white/85 with offset; main
action 52px, secondary 48px. Card text: title 28px semibold, tracking -0.02em, text shadow `0 2px 12px rgb(0 0 0/0.4)`;
subtitle 15px white/65; labels 13px white/80.

**Glass layers are siblings, never ancestors.** The glass is an `absolute inset-0` layer behind the content; each button
and field has its own glass layer. An element with a backdrop-filter is a backdrop root, so glass nested inside it would
only see its tint.

## How ours differed before this change

| | Before | Now |
|---|---|---|
| Map | `liquidGlassMaps.ts`: per-pixel normal of the box, squircle bezel, a flat magnifying face, data URLs | the 21st.dev map ported exactly (`computeDisplacementData`, phi table, gain 1.35, blob URLs) |
| Cards | solid fill (`bg-neu-base`, `#14110F` on black), neumorphic shadows, no backdrop | 21st.dev card: white tint 0.10, the refracting backdrop on a `::before` layer behind the content, the card shadow |
| Buttons | clear lens with a faint fill; primary solid orange | 21st.dev glass button; primary is signal glass at 0.34 |
| Dispersion | channel scales x1, x1.035, x1.075 | red `scale + aberration`, green `scale`, blue `scale - aberration` |
| Fallback | blur 14px, saturate 1.8, brightness 1.08 | the Simple mode values above |

## Calls I made

Each is a decision the brief left open; the reason is the one written next to it.

1. **Light theme tint.** The source's white 0.10 tint is invisible on the light theme's gray page, so cards are white 0.62, rows and fields
   white 0.5, buttons white 0.6, and the shadows keep their shapes at lower strength (the brief's "raise the tint just enough").
2. **Floating panels** (menus, sheets, dialogs, the top banner, anything with `role="dialog"`) use the source tint over the theme's solid
   surface at 0.95, and keep an 8px blur with the bend (the source's 0.5px), because at the source's values page text behind them read
   through.
3. **Stacked deck cards** (the phone card deck) use the floating tint, and the deck's old drop-shadow filter is removed: a filter makes an
   element a backdrop root, so the glass would have seen nothing.
4. **Small panels bend less.** A card's bevel is at most 22% of its short side and its bend 30%, and panels under 160px and buttons under
   40px tall have no colour split; big cards get the source's values exactly. On small tiles the full values turned the whole face into
   rim and the text swam in a rainbow.
5. **Map resolution.** Cards, rows and fields build their map at 1x (the source uses up to 2x); buttons keep up to 2x. Card maps share one
   filter per 8px size step, and panels larger than 900,000 px keep the blurred glass without the live bend.
6. **Only what is on screen refracts** (within 200px), at most 160 filters; the rest has the same tint, rim and shadow with the source's
   "loading" blur.
7. **Card corners are 32px** (`--radius-card`, `--surface-radius`), the source's card radius. Rows, fields and buttons keep their radii.
8. **Button heights.** The shared Button keeps its sizes (`h-9`, `h-8`); `size="lg"` is now the source's 52px. On the auth card the main
   action is 52px, the other buttons and the fields 48px. Raising every button to 48px would have broken the dense admin and phone layouts.
9. **Primary label colour.** On orange glass the label is the theme's text colour (cream on dark, near black on light), not the old
   dark ink on solid orange, which fails on 0.34 orange over black. A disabled main action goes neutral glass, as before.
10. **`ghost` and `paper` are glass too** (every variant except `danger` and `link`). `danger` stays solid red; `link` is text.
11. **Admin quiet buttons.** The 2026-11-07 rule that stripped admin secondary buttons to plain text is removed; they are the quiet glass
    (white 0.07), which keeps the one orange main action as the focal point.
12. **Focus ring.** A 2px outline, white 0.85 on dark and the theme's text colour at 0.7 on light (white is invisible on the light page).
13. **Plan colour cards stay solid.** The 3 and 6 Month cards on the pricing page and the plan tiles on Billing > Plans carry the owner's
    plan colours; glass over that colour dropped the tag's contrast below AA, so they keep a solid base (`data-glass-solid`).
14. **Home's photo.** The older Home-only frosted fill on each card is removed; the cards are the liquid glass and bend the photo.
15. **Auth title** is a 28px class (`lgx-auth-title`) rather than `text-hero`, which grows to 44px and wrapped "Create your account" on a
    400px card. Subtitle `text-body` at 65%, labels `text-small` at 80% on the photo.
16. **Photo overlay** is black 60% on phones and 65% plus a 14px blur on wider screens, with a darker band at the top for the logo.
17. **Drag** is mouse only and limited to the window, on `/login` and `/register`.
18. **Inputs** become the source field only where they use `Input` / `PasswordInput` or the old `bg-neu-base` / pressed classes; other
    hand-styled inputs keep their look.
19. **Tabs' sliding thumb, the sidebar's orange pill, `switch`, the dock, the piano keyboard and fretboard, the stageshow kit** keep their
    looks: the first two animate in ways the glass layer would stop, the rest are on the brief's keep list.
20. **Coloured callouts that mean something** (amber warnings, red errors, green success, the orange "reschedule" banner) keep their tints.

21. **The frame (owner follow-up, 2026-11-14).** The dock, sidebar, phone top bar and pinned greeting are glass with the source's
    bend plus a 14px blur and a 45% surface tint under the source's white, because page content scrolls under them; the dock keeps
    its Instagram shape and capsule. Cards that are links (Home's rows and tiles, the Overview's tiles) get the card glass, not the
    lighter button glass. The heroes are coloured glass: their colour is a layer at 62% (86% on the light theme, for white text).

## Couldn't match exactly

- **Safari and Firefox** cannot run the refraction filter; they get the source's frosted look (as the source itself does).
- **Hover on refracting buttons** is the overlay on the glass layer, as in the source, but a button that uses `hit-slop` (its `::after`
  is the bigger touch area) draws its tint on itself, so it has the look without the live bend.
- **Axe findings still open are all pre-existing** and in files this branch does not touch: `label-content-name-mismatch` on the Home hero,
  the admin phone section bar and the schedule's weekday tiles, and two inside the stageshow kit on `/` and `/pricing`.
- **Light theme plan tiles**: the "No commitment" and "3 payments" tags are faint on their own plan colour; that colour is unchanged by this
  work.

## Checklist

Pages (62) and every component the brief names. Ticked when the page or component shows the new glass and was checked.

### Auth (9)

- [x] `/login`
- [x] `/register`
- [x] `/forgot-password`
- [x] `/reset-password`
- [x] `/verify-email`
- [x] `/verify-phone`
- [x] `/account-locked`
- [x] `/wrong-account`
- [x] `/unsubscribe`

### Student and parent (19)

- [x] `/dashboard`
- [x] `/lessons`
- [x] `/practice`
- [x] `/practice/piano`
- [x] `/scales/[scaleSlug]`
- [x] `/roadmap`
- [x] `/streak`
- [x] `/leaderboard`
- [x] `/friends`
- [x] `/mail`
- [x] `/mail/[mailId]`
- [x] `/profile`
- [x] `/account`
- [x] `/about`
- [x] `/billing/plans`
- [x] `/billing/history`
- [x] `/billing/receipt/[paymentId]`
- [x] `/parent`
- [x] `/parent/[childId]`

### Admin (25)

- [x] `/admin`
- [x] `/admin/today`
- [x] `/admin/activity`
- [x] `/admin/students`
- [x] `/admin/users`
- [x] `/admin/users/[userId]`
- [x] `/admin/contacts`
- [x] `/admin/contacts/[contactId]`
- [x] `/admin/employees`
- [x] `/admin/lessons`
- [x] `/admin/schedule`
- [x] `/admin/roadmaps`
- [x] `/admin/messages`
- [x] `/admin/sent`
- [x] `/admin/support`
- [x] `/admin/support/[id]`
- [x] `/admin/payments`
- [x] `/admin/payment-plans`
- [x] `/admin/pricing`
- [x] `/admin/money-check`
- [x] `/admin/scholarships`
- [x] `/admin/data`
- [x] `/admin/discord`
- [x] `/admin/security`
- [x] `/admin/settings`

### Public (6)

- [x] `/`
- [x] `/pricing`
- [x] `/classes`
- [x] `/shop`
- [x] `/privacy`
- [x] `/terms`

### Other

- [x] `/onboarding`
- [x] `/motion-preview`
- [x] `/stageshow-preview`
- [x] `not-found.tsx`
- [x] `global-error.tsx`
- [x] `error.tsx(x3)`
- [x] `ErrorScreen`

### Buttons

- [x] `Button(all`
- [x] `variants)`
- [x] `bubble-button`
- [x] `button-33`
- [x] `pill-cta`
- [x] `send-button`
- [x] `attachment-button`
- [x] `GuardedButton`
- [x] `ActionTiles`
- [x] `ActionMenu`
- [x] `SlidingPill`
- [x] `Tabs`
- [x] `switch`
- [x] `GlassBubbles`
- [x] `GlassSlider`
- [x] `LiquidPress`
- [x] `GoogleSignInButton`
- [x] `AskAiButton`
- [x] `SidebarToggle`
- [x] `ScrollToTopButton`
- [x] `BadgesSheetButton`
- [x] `ProfileEditButton`
- [x] `Admin*Button`
- [x] `BulkConfirmButton`
- [x] `RemindButton`
- [x] `QuickMessageButton`
- [x] `CspClearButton`
- [x] `InlineConfirm`
- [x] `InviteToRegisterButton`
- [x] `PlanHistoryButton`
- [x] `PrintReceiptButton`
- [x] `AskTogetherButton`
- [x] `JoinClassButton`
- [x] `MessageSupportButton`

### Cards

- [x] `Card(+Eyebrow)`
- [x] `CardKit`
- [x] `MetricCard`
- [x] `CardDeck`
- [x] `Shelf`
- [x] `HeroBand`
- [x] `Hero`
- [x] `EmptyState`
- [x] `RoadmapCard`
- [x] `CelebrationCard`
- [x] `ColorCard`
- [x] `ShelfCards`
- [x] `GlanceTiles`
- [x] `ParentRequestCard`
- [x] `TeacherNotesCard`
- [x] `PausePlanCard`
- [x] `PhoneCard`
- [x] `DiscordConnectCard`
- [x] `MoneyIssueCard`
- [x] `LessonsTiles`
- [x] `NextClassBand`
- [x] `Skeleton`
- [x] `PageSkeletons`
- [x] `loading.tsx(43)`
- [x] `input`
- [x] `password-input`
- [x] `FileDropzone`
- [x] `Stepper`

### Panels, sheets, menus

- [x] `Dialog`
- [x] `SlideOverPanel`
- [x] `CommandMenu/command`
- [x] `ProfileMenu`
- [x] `NotificationBell-panel`
- [x] `Toaster`
- [x] `tooltip`
- [x] `WhatsNewModal`
- [x] `AssistantWidget`
- [x] `PlanBillSheet`
- [x] `ZellePaymentModal`
- [x] `QuizModal`
- [x] `TopBar`
- [x] `AppSidebar`
- [x] `MarketingNav`
- [x] `AnnouncementBanner`
- [x] `TopBanners`

### Login change

- [x] Slide-over Log in panel removed from `MarketingNav`; every Log in link goes to `/login?callbackUrl=<path>`
- [x] `/login` and `/register` share the photo background and the glass card
- [x] Card drags with a mouse only on `/login` and `/register`

## Performance

Production builds of `main` and this branch, the same machine, `scripts/glass-revamp/perf.mjs` (dark, student and admin). Load times on
this shared machine are noisy: compare the structure, not the milliseconds. "Blurred elements" are elements with their own
backdrop-filter; "glass layers" are the new `::before` / `::after` layers (all, and on screen); "live lenses" refract.

| Page | Size | Before: blurred elements / layers | After: blurred elements / layers (on screen) / live lenses | LCP before / after (ms) |
|---|---|---|---|---|
| /dashboard | 1440 | 59 / 4 | 2 / 42 (32) / 22 | 1468 / 1808 |
| /dashboard | 390 | 61 / 2 | 2 / 42 (14) / 10 | 1180 / 1408 |
| /lessons | 1440 | 7 / 3 | 1 / 21 (20) / 13 | 244 / 312 |
| /lessons | 390 | 9 / 1 | 1 / 21 (11) / 7 | 176 / 920 |
| /scales/major-scale | 390 | 9 / 1 | 1 / 17 (7) / 3 | 208 / 184 |
| /admin | 1440 | 11 / 2 | 1 / 33 (23) / 15 | 948 / 1196 |
| /admin | 390 | 12 / 1 | 1 / 33 (16) / 11 | 788 / 1180 |

Raw rows: `docs/glass-revamp/evidence/GL-03-01/perf-*.json`. Home on a phone composites about the same number of blurred surfaces as before
(14 on screen against 61 elements before, most of which were off screen). Every page now has more glass than before, because content
cards used to be solid; on screen it stays between 7 and 32 layers.
