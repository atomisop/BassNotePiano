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

(Filled in as the work goes; each is a decision the brief left open.)

## Checklist

Pages (62) and every component the brief names. Ticked when the page or component shows the new glass and was checked.

### Auth (9)

- [ ] `/login`
- [ ] `/register`
- [ ] `/forgot-password`
- [ ] `/reset-password`
- [ ] `/verify-email`
- [ ] `/verify-phone`
- [ ] `/account-locked`
- [ ] `/wrong-account`
- [ ] `/unsubscribe`

### Student and parent (19)

- [ ] `/dashboard`
- [ ] `/lessons`
- [ ] `/practice`
- [ ] `/practice/piano`
- [ ] `/scales/[scaleSlug]`
- [ ] `/roadmap`
- [ ] `/streak`
- [ ] `/leaderboard`
- [ ] `/friends`
- [ ] `/mail`
- [ ] `/mail/[mailId]`
- [ ] `/profile`
- [ ] `/account`
- [ ] `/about`
- [ ] `/billing/plans`
- [ ] `/billing/history`
- [ ] `/billing/receipt/[paymentId]`
- [ ] `/parent`
- [ ] `/parent/[childId]`

### Admin (25)

- [ ] `/admin`
- [ ] `/admin/today`
- [ ] `/admin/activity`
- [ ] `/admin/students`
- [ ] `/admin/users`
- [ ] `/admin/users/[userId]`
- [ ] `/admin/contacts`
- [ ] `/admin/contacts/[contactId]`
- [ ] `/admin/employees`
- [ ] `/admin/lessons`
- [ ] `/admin/schedule`
- [ ] `/admin/roadmaps`
- [ ] `/admin/messages`
- [ ] `/admin/sent`
- [ ] `/admin/support`
- [ ] `/admin/support/[id]`
- [ ] `/admin/payments`
- [ ] `/admin/payment-plans`
- [ ] `/admin/pricing`
- [ ] `/admin/money-check`
- [ ] `/admin/scholarships`
- [ ] `/admin/data`
- [ ] `/admin/discord`
- [ ] `/admin/security`
- [ ] `/admin/settings`

### Public (6)

- [ ] `/`
- [ ] `/pricing`
- [ ] `/classes`
- [ ] `/shop`
- [ ] `/privacy`
- [ ] `/terms`

### Other

- [ ] `/onboarding`
- [ ] `/motion-preview`
- [ ] `/stageshow-preview`
- [ ] `not-found.tsx`
- [ ] `global-error.tsx`
- [ ] `error.tsx(x3)`
- [ ] `ErrorScreen`

### Buttons

- [ ] `Button(all`
- [ ] `variants)`
- [ ] `bubble-button`
- [ ] `button-33`
- [ ] `pill-cta`
- [ ] `send-button`
- [ ] `attachment-button`
- [ ] `GuardedButton`
- [ ] `ActionTiles`
- [ ] `ActionMenu`
- [ ] `SlidingPill`
- [ ] `Tabs`
- [ ] `switch`
- [ ] `GlassBubbles`
- [ ] `GlassSlider`
- [ ] `LiquidPress`
- [ ] `GoogleSignInButton`
- [ ] `AskAiButton`
- [ ] `SidebarToggle`
- [ ] `ScrollToTopButton`
- [ ] `BadgesSheetButton`
- [ ] `ProfileEditButton`
- [ ] `Admin*Button`
- [ ] `BulkConfirmButton`
- [ ] `RemindButton`
- [ ] `QuickMessageButton`
- [ ] `CspClearButton`
- [ ] `InlineConfirm`
- [ ] `InviteToRegisterButton`
- [ ] `PlanHistoryButton`
- [ ] `PrintReceiptButton`
- [ ] `AskTogetherButton`
- [ ] `JoinClassButton`
- [ ] `MessageSupportButton`

### Cards

- [ ] `Card(+Eyebrow)`
- [ ] `CardKit`
- [ ] `MetricCard`
- [ ] `CardDeck`
- [ ] `Shelf`
- [ ] `HeroBand`
- [ ] `Hero`
- [ ] `EmptyState`
- [ ] `RoadmapCard`
- [ ] `CelebrationCard`
- [ ] `ColorCard`
- [ ] `ShelfCards`
- [ ] `GlanceTiles`
- [ ] `ParentRequestCard`
- [ ] `TeacherNotesCard`
- [ ] `PausePlanCard`
- [ ] `PhoneCard`
- [ ] `DiscordConnectCard`
- [ ] `MoneyIssueCard`
- [ ] `LessonsTiles`
- [ ] `NextClassBand`
- [ ] `Skeleton`
- [ ] `PageSkeletons`
- [ ] `loading.tsx(43)`
- [ ] `input`
- [ ] `password-input`
- [ ] `FileDropzone`
- [ ] `Stepper`

### Panels, sheets, menus

- [ ] `Dialog`
- [ ] `SlideOverPanel`
- [ ] `CommandMenu/command`
- [ ] `ProfileMenu`
- [ ] `NotificationBell-panel`
- [ ] `Toaster`
- [ ] `tooltip`
- [ ] `WhatsNewModal`
- [ ] `AssistantWidget`
- [ ] `PlanBillSheet`
- [ ] `ZellePaymentModal`
- [ ] `QuizModal`
- [ ] `TopBar`
- [ ] `AppSidebar`
- [ ] `MarketingNav`
- [ ] `AnnouncementBanner`
- [ ] `TopBanners`

### Login change

- [ ] Slide-over Log in panel removed from `MarketingNav`; every Log in link goes to `/login?callbackUrl=<path>`
- [ ] `/login` and `/register` share the photo background and the glass card
- [ ] Card drags with a mouse only on `/login` and `/register`

## Performance

(Numbers from `scripts/glass-revamp/perf.mjs`, before and after.)
