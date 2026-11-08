# Master prompt: rebuild the Bass Note Piano UI in a Suno-style shell

Copy everything below the line into a fresh Claude Code (or any coding agent) session. It describes the
whole product, top to bottom, then says how to dress it in the Suno look from the two reference
screenshots (expanded sidebar and collapsed icon rail). Attach both screenshots with it.

---

## 0. Role and rules

You are rebuilding the UI of **Bass Note Piano**, my own product (Ethiopian scales, rhythm and chords taught
live; piano, guitar and bass). It is my app, so reproduce every screen faithfully; do not worry about copyright.
Keep every route, every piece of data and every behaviour. Change the **look and shell**, not the logic.

Stack to keep: Next.js 14 App Router, React 18, TypeScript 5, Tailwind 4 (tokens in an `@theme` block),
Framer Motion, NextAuth (credentials, JWT), Prisma + Postgres. Icons come from one file
(`@/components/ui/appIcons`); never import an icon package directly or hand-draw SVGs.
No em dashes anywhere in copy or comments. Every input, select and textarea is at least 16px (iOS zoom).
Anything shorter than 36px that is tappable gets a 44px minimum on touch. Check every screen at 1440, 768,
390 and 320px wide. Respect `prefers-reduced-motion`.

## 1. The look: Suno shell + Bass Note Piano content

Treat the Suno screenshots as the **colour and shell reference**. Bass Note Piano keeps its own content,
fonts and one warm orange accent; Suno supplies the near-black floating-panel layout, the warm glow and the pill
controls.

### 1.1 Colour tokens (dark is the default theme; build a mirrored light theme)

| Token | Dark value | Use |
|---|---|---|
| `--bg-outer` | `#0a0a0c` (a hint of blue-black) | the window behind the floating panels, the 8px gutter |
| `--bg-sidebar` | `#141416` | left navigation panel |
| `--bg-main` | `#111112` | main content panel |
| `--bg-card` | `#1c1c1e` | cards, one solid step above the panel, no border, no shadow |
| `--bg-card-lift` | `#26262a` | card inside a card, hover |
| `--bg-active-row` | `#2a2a2d` | the selected nav row (a wide pill) |
| `--hairline` | `rgba(255,255,255,0.10)` | outlined buttons, input border, dividers |
| `--text` | `#f5f5f5` | primary text |
| `--text-2` | `#a8a8a8` | secondary text (never darker than `#8a8a8a`) |
| `--accent` | `#fb8a5c` (the logo orange) | the one "do this next" colour, at most 3 per screen |
| `--accent-ink` | `#1a140e` | text on an orange fill |
| `--glow` | `radial-gradient(ellipse at 50% 18%, rgba(190,90,30,0.42), rgba(120,50,15,0.18) 40%, transparent 70%)` | the warm brown-orange bloom behind the hero heading and prompt box (see Suno's home) |
| `--badge-blue` | `#1f6bff` | "Artist spotlight" style tag |
| `--badge-pink` | `#ff2e88` | "Beta feature" style tag |
| success / warning / danger | `#4ade80` / `#fcd34d` / `#ef4444` | states only |

Light theme: ground `#f2f2f5`, panels white at 70%, text `#1a150f`, accent `#d65c2c`, orange text `#9c3612`
(contrast). Never hard-code a hex in a component; read tokens.

Primary buttons are **white pills with black text** (Suno's "Create with v6", "Try Speech") on dark photo
cards; on the plain panel the primary is the orange pill. Secondary buttons are transparent pills with a 1px
`--hairline` border and a leading icon ("Watch the film"). Tags are small solid-colour pills in 12px uppercase
semibold white text.

### 1.2 Shell (this is the part that must match Suno)

- The whole app is a dark window with an **8px gutter**. Inside it are **separate floating panels** with
  **24px corner radius**: a left sidebar panel and a main content panel. A third, borderless strip at the
  bottom holds the audio/practice player. Panels never touch each other or the window edge.
- **Expanded sidebar, 360px wide** (Suno screenshot 1): the wordmark top-left (Bass Note Piano's logo mark
  plus lowercase serif wordmark, replacing "SUNO"), a circular outlined toggle button top-right (a
  panel-left icon). Below it a vertical list of rows, each 70px tall: 24px icon, 20px label, 16px radius
  pill. The active row fills `--bg-active-row`. Rows, top group: Home, Roadmap, Practice, Lessons, Library
  (saved scales and notes), then the user's avatar and username as the last row. Bottom group pinned to the
  bottom: Earn Credits (invite a friend), Labs (tutorials), Notifications, More. Admins get their six
  sections (Overview, Billing, People, Classes, Inbox, Setup) as an extra group.
- **Collapsed sidebar, 116px icon rail** (Suno screenshot 2): the toggle sits at the top with no label, every
  row becomes a centered 28px icon, the active item is a **white 2px outlined circle** around its icon, the
  avatar is a small circle, bottom icons stay pinned. The main panel grows to fill the space. The toggle
  animates the width over 240ms with the iOS curve, labels fade out in the first half. Shortcut: `B`.
- **Top-right of the main panel:** a glass search pill (`Search` with a magnifier), 52px tall, fully rounded,
  `--hairline` border, translucent fill. Cmd/Ctrl-K opens the command menu from it.
- **Bottom player strip**, full width under both panels, no card: centered transport controls (shuffle,
  previous, play, next, repeat), a thin progress bar beneath them (white 4px dot scrubber, track at 20% white),
  volume icon far right. For Bass Note Piano this is the **metronome and backing-track player** used inside
  lessons; it is hidden on pages that do not use it.
- **Phones (under 768px):** no sidebar panel. Use the floating pill dock (five icons: Home, Roadmap,
  Practice, Lessons, Messages; admins get Admin in Messages' place), 58px tall, 22px from the screen edges,
  dark smoky glass, a light capsule behind the current tab that slides on a spring, a small red unread dot.
  The top bar shows logo, credit badge, Ask AI and avatar only. Everything else lives in the avatar menu.
  Pull to refresh with a 12-spoke spinner.
- Scrollbars hidden; a thin orange scroll-progress line at the very top of the main panel.

### 1.3 Type

Public pages: Sora for everything. Inside the app: the system font (SF Pro on Apple devices). Page titles in
Baloo 2. JetBrains Mono for keys and codes. Scale: caption 12, small 13, body 16, title 20, headline 24, hero
28 to 44 fluid, figure 52 to 64 for counters. Weights 400 text, 500 labels, 600 titles and buttons. Tabular
numbers in the app. Sentence-case labels. Headings use `text-wrap: balance`, paragraphs `pretty`.
Suno's home hero heading ("Hear your vision like never before") is about 56px, weight 500, tight tracking,
centered: use that treatment for the dashboard greeting line and for the marketing hero's secondary headings.

### 1.4 Shape, depth, motion

Radii: 8 chips, 12 fields and rows, 16 cards, 24 panels and sheets, full pill for every button, filter chip,
avatar and the dock. Cards are **flat solid fills with no border and no shadow**; only floating things (menus,
dialogs, sheets, the dock, the top bar) get the one floating shadow
`0 2px 4px rgba(0,0,0,.45), 0 12px 28px -8px rgba(0,0,0,.6)`. 4-point spacing: 16/20 inside cards, 12/16
between cards, 32/48 between sections. Motion: 150 to 200ms hover and press, 240ms entering, the iOS ease
`cubic-bezier(0.32,0.72,0,1)`. Keyboard shortcuts never animate (set a `data-kb-motion="off"` flag until the
next pointer press).

## 2. Public marketing site (route group `(marketing)`)

Sticky glass nav: logo mark + lowercase serif wordmark, links (Classes, Pricing, Shop), a Discord icon button,
"Log in" ghost pill and an amber **Get started** pill. On phones a 44px hamburger opens a full-screen
blurred overlay with huge row links separated by hairlines and a full-width primary button.

1. **Hero**, 100svh, full-bleed looping muted piano video (4K on desktop, 1080p tablet, 720p phone, still
   poster first, paused for reduced motion or data saver), film grain overlay, top-to-bottom black gradient.
   Bottom-centered: H1 "Bass Note Piano" at `clamp(3rem, 11vw, 8rem)`, words pulling up one by one; line
   "Ethiopian music, taught live. Piano, guitar and bass lessons with a real teacher, and a curriculum that opens
   one scale at a time."; two pills, **Get started** (or Go to dashboard when signed in) and **See pricing**.
   Lay the Suno warm glow under the copy so the video fades into the panel colour below.
2. **Statement**: one short centered problem line, a quiet beat.
3. **Instrument picker**: Piano, Guitar, Bass as large selectable cards (Drums and Voice shown as "coming soon"
   with an interest-registration form, never bookable).
4. **Social proof** as an asymmetric editorial split: three numbered points (mono `01`, `02`, `03` in amber):
   The source (built from a real published method book), The teacher (live one-on-one and family lessons over
   Discord), The coverage (every scale spelled correctly in all twelve keys).
5. **Solution** feature showcase: six features (Every scale in all twelve keys; Chords built from each scale's own
   five notes; Piano, guitar and bass; Teacher-approved progression; 45-minute live lessons; A reserved weekly
   slot) beside a bounded product-reveal card that switches between two real app screenshots with tabs.
6. **How it works** timeline, four steps: Start live classes, Work through it at your pace, Meet your teacher
   every week, Watch it add up.
7. **FAQ** accordion: music theory needed? which instruments? curriculum without classes? how live lessons work,
   billing (every 28 days), canceling a booked lesson, trying the community free.
8. **Final CTA**, then **footer** (Explore and Account link columns, Terms, Privacy, Discord, copyright).
- `/classes`: class format and the booking explainer. `/pricing`: three plan cards (1 Month, 3 Months, 6 Months;
  billed every 28 days, each bill pays for exactly 4 classes), a Just me / Me and others toggle, the extra-class
  price, family/group discount. `/shop`: recommended gear grid with external links. `/terms`, `/privacy`.
- Sections use hairline rules and an editorial grid, not a card per section. Only the product reveal is a card.

## 3. Auth (route group `(auth)`)

Login (password, then a 6-digit emailed code), Register (first and last name, email, phone, password with the
live strength bar and checklist: 8+ characters and one special character), Reset password, Verify email, Account
locked, Wrong account. Centered 24px-radius sheet on the `--bg-main` panel with the warm glow behind it. Inputs
are 12px radius, 16px text; errors in red; the banned and payment-locked messages render in red.

## 4. Signed-in app (route group `(dashboard)`)

All inside the Suno-style shell from section 1.2.

- **Home** (`/dashboard`): Suno's home composition. Centered hero heading over the warm glow ("Hear your
  vision like never before" becomes the student's one next step, e.g. "Pick up Scale 2"). Under it a wide
  rounded prompt-style card (24px radius, `--hairline` border) holding the one thing to do today with a round
  `+` button, a dice-style shuffle button and an orange **Continue** pill. Then a two-up row of large photo
  cards with a bottom gradient, a coloured tag pill, title, one-line detail and white/outlined pills (the
  roadmap card with piano keys artwork; "Next class" with a countdown and the Discord join button). Then a
  three-up row of playlist-style cards (a 140px rounded artwork tile + title, and one row beneath): Continue
  lesson, Today's practice, Friends practicing. Below: quiet rows with hairlines (credits, streak, badges).
- **Roadmap** (`/roadmap`, `/scales/[slug]`): grid of scale cards with progress; the course player with video,
  PDF, practice checklist, quiz, Notes, Metronome and a piano/guitar/bass instrument switch. A teacher-approved
  lock state on unopened scales; free-trial lessons beyond three show title only.
- **Practice** (`/practice`): the 10-minute daily finger practice with a streak counter in the big-figure size.
- **Lessons** (`/lessons`): weekly slot picker (weekday and time chips, taken times dimmed with "Tell me when it
  opens"), booking, cancel, reschedule, family class; credits shown as classes (one credit is one 45-minute
  class, stored as half-classes).
- **Billing** (`/billing/plans`, receipts): the plan form (Just me / Me and others / Parent mode), live price bar,
  payment sheet with the BNP reference code, history, printable receipt.
- **Friends, Messages (1:1 and group), Leaderboard, Streak, Mail, Notifications bell, Profile, About, Support.**
- **Account** (`/account`): tabbed settings: profile, contact, security and devices, notifications switches,
  appearance (the dark/light toggle), tutorials, calendar feed, push reminders, invite a friend, privacy and
  data, pause plan, **Delete account** danger zone (red, password plus emailed code).
- **Atom**: floating AI assistant (Gemini) on every page; thumbs up/down, "talk to a human" handoff, live support
  mode. Footer line "AI assistant. Don't share passwords or card numbers."
- **Top banners** (phone number, Discord, practice) look like an iPhone notification, at most one at a time, only
  on Home; a bill bar sits under the top bar while a renewal is due.
- **Command menu** (Cmd/Ctrl-K), shortcut sheet (`?`), `G` then a letter to jump, toasts with Undo, a 5-second
  hold-to-undo for irreversible actions, offline pill, Add-to-Home-Screen prompt, what's-new modal, tour.

## 5. Admin (`/admin`, owner and teacher only)

Sidebar group (or the phone section bar) with six hubs, each with underlined section tabs:
Overview (schedule hero with today's classes and a 7-day strip, money bars, rough "how it's going"),
Billing (Payments, Plans, Pricing, Check), People (Accounts, Applicants, Contacts, Staff),
Classes (Today, Schedule, Lessons, Discord), Inbox (Support Chat two-pane live inbox, Messages),
Setup (Settings, Security, Activity, Roadmaps, Data). Tables become cards on phones. Tabs never scroll sideways;
a dot marks a tab with something waiting. Use the same panel, card and pill rules as the student app.

## 6. Build order

1. Tokens: add the Suno-derived dark and light values to `themes.css`/`globals.css`; keep names, change values.
2. Shell: floating sidebar (expanded and rail), main panel, top-right search pill, bottom player strip, phone dock.
3. Home composition, then Roadmap and the course player, then Lessons, Billing, Account, Friends/Messages.
4. Marketing hero and sections, auth screens, admin.
5. Accessibility pass (axe-core WCAG 2.2 AA), mobile pass at 390 and 320, reduced-motion pass.
6. Run `tsc --noEmit`, `next lint`, `npm test`, `next build`. Show screenshots for each screen and wait for my
   confirmation before moving to the next; commit locally and never push or open a PR unless I say so.

## 6b. Screen-by-screen protocol (nothing may be skipped)

Before changing any code, build an **inventory** at `docs/CLONE-INVENTORY.md`: list every route under
`src/app`, and for each route every component it renders (read the files; also use
`node floorplan/query.mjs find` and `show`). Include modals, sheets, menus, empty, loading, error and locked
states, toasts, banners, forms, tables, and the phone and light-theme variants. Each row has a checkbox.
Then work **one screen at a time**, in this order: shell, Home, Roadmap and course player, Practice, Lessons,
Billing, Friends and Messages, Account, Atom, auth, marketing, admin. For each screen:
1. Restyle every component on it to the Suno-derived tokens; delete no feature and no state.
2. Screenshot it at 1440, 768, 390 and 320px, dark and light, and compare with the reference.
3. Tick its rows only after the screenshot shows the component.
4. Stop and wait for my confirmation before the next screen.
At the end, print any unchecked inventory row. If I name another app (for example my Amharic mezmur
lyrics app), repeat the same inventory for it and tell me where its folder is before starting.

## 7. Definition of done

Side by side with the Suno screenshots the shell must read as the same family: near-black floating panels,
24px corners, a warm orange-brown bloom behind the hero, white and hairline-outlined pills, solid flat cards,
a wide grey active-row pill in the sidebar and a white outlined circle on the active icon in the collapsed rail.
Bass Note Piano keeps its own content, fonts, logo and single orange accent.

---

# PART B: Ye Mezmur Getim (Amharic mezmur lyrics app)

Folder: `/Users/yisehakberhanu/Desktop/amharic-mezmur-lyrics-cloudflare-handoff/`. Second product, same owner,
same rules as Part A (screen by screen, inventory first, screenshots, confirm, nothing skipped, never push
unasked). Read `README.md`, `HANDOFF-CLOUDFLARE.md`, `redesign-tokens.md` and `redesign-audit.md` first.

## B0. What it is

"Ye Mezmur Getim" (የመዝሙር ግጥም): an Amharic Protestant and Tewahedo worship lyrics library. Artist and album
browsing, full lyrics, chords, playlists, audio uploads, lyric timing and sync, worship slides (PowerPoint
export), find-by-listening (song recognition), offline library, community submissions, donations, an admin
usage dashboard. Stack: Next.js (vinext) on a Cloudflare Worker, D1 (Drizzle) for records, R2 for media,
email one-time-link sign-in through Resend, shadcn/ui primitives in `components/ui/`, `CoolIcon` icons.
Keep every route and API; change the look and shell only. Amharic text must render correctly everywhere
(Ethiopic font stack with a fallback, `lang="am"` on lyrics, line height at least 1.6, never clip or
letter-space Ethiopic).

## B1. Look

The shell already exists in part (`app/suno-shell.css`: `--sx-*` tokens, sidebar, `.sx-home` stage, feature
cards, list cards). Finish it and make it the only skin: remove the older neumorphic and yellow
"ethiopia-theme" layers (`neumorphism.css`, `ethiopia-theme.css`, the `:root:root:root:root` specificity
hacks and `!important` chains) once each screen is moved over. Use the same Suno-derived dark tokens as Part A
section 1.1 (near-black panels, `#1c1c1e` flat cards, white primary pills, hairline outlined secondary pills,
warm amber glow behind the hero, blue and pink tag pills).

Brand accent for this app: the Ethiopian flag, used sparingly as **colour accents only, never as backgrounds**:
green `#078930` (success, "saved offline", primary action on light surfaces), gold `#f2d34f` (highlight, current
line in synced lyrics, focus ring), red `#da291c` (danger, delete, live/recording). One accent per screen as the
dominant one. Collapse the 24 greys in `redesign-tokens.md` to its 11-step ramp and its 15-step type scale and
13-step radius scale; components read semantic tokens (`--bg --surface --text --text-muted --border --accent
--success --warning --danger --focus`), never a primitive or a raw hex.

Shell: collapsible sidebar (220px, 64px collapsed with a white outlined ring on the active icon), floating
rounded panels with an 8px gutter, glass search pill top right, bottom player bar (audio, synced lyrics
transport). Phones: bottom navigation (`bottom-navigation.css`) as a floating pill dock, no sidebar. Touch
targets at least 44px, inputs at least 16px.

## B2. Screens and components to rebuild (inventory seed, extend it by reading the code)

Views in `mezmur-app.tsx`: `home`, `mezmur` (sections: songs, playlists), `chords`, `scale`, `identify`,
`explore`, `artists`, `artist`, `album`, `playlist`, `worship`, `offline`; routes `/`, `/artists`,
`/artists/[slug]`, `/login`.

- **Home / hero** (`home-hero.tsx`, `.sx-home`): eyebrow "AMHARIC WORSHIP LYRICS", headline "Sing every word,
  together.", the lede, primary **Browse artists**, three points (Full lyrics, Find by listening, Offline), the
  prompt-style search stage with idea chips, two feature cards (blue and pink tags), three list cards (artists,
  songs, playlists) with tiles and rows. Home playlists come from `/api/home-playlists`.
- **Sidebar**: wordmark "MEZMUR", toggle, Home, Artists, Songs, Playlists, Chords, Scale, Identify a song,
  Worship slides, Offline, Invite friends, profile/account row; bottom group pinned.
- **Library search dialog** (`library-search-dialog.tsx`) and artist search results (`artist-search-results.css`),
  `books-dropdown`, `music-category-browser`, category fields.
- **Artists list and artist page**: `artist-portrait`, `artist-bio`, `artist-channel-link`, album chooser
  ("All songs" plus one compact album row each, cover, count, "Live session" tag), `manage-artists`,
  `artist-album-fields`.
- **Song view**: full lyrics reader (`mezmur-browser`), `lyric-portion-picker`, `lyric-action-prompt`, details
  (`song-details-editor`, `song-details.css`: genre, scale, play on YouTube), `synced-youtube`, audio panel
  (`song-audio-panel`), chords (`mezmur-chords`, `song-chords-editor`), lyric timing and sync (`lyrics-sync`,
  `/api/lyric-timing`).
- **Find by listening** (`find-by-listening`, `/api/song-recognition`), **Offline library** (`offline-library`),
  **Playlists** (`admin-playlist-browser`, account playlists tab), **Worship studio** (`worship-studio`:
  background picker, slide preview, branded PowerPoint export, `/api/worship*`).
- **Community and submissions** (`lyrics-submission-fields`, `submission-review`, `/api/community`),
  **donation panel**, **usage dashboard** (`usage-dashboard`, `usage-tracker`), **popup dialog**, terms dialog
  ("Effective November 3, 2026"), account tabs, **login** (email link, `app-access`), connector error state.
- Every `components/ui/*` primitive in use gets the new tokens once, at the source, rather than per screen.

## B3. Protocol

1. Write `CLONE-INVENTORY.md` in that folder: every route, view, dialog, sheet, menu, empty, loading, error and
   offline state, API-driven state, admin-only state, and phone and desktop variants. Checkbox each.
2. Tokens first (`globals.css` plus the redesign tokens), then the shell, then one view at a time in the order
   above. After each: screenshots at 1440, 768, 390 and 320px (and a long Amharic lyric on each), tick rows,
   wait for my yes.
3. Delete the superseded skin files only after the last screen using them is migrated and checked.
4. Run the project's lint, type check and tests (`tests/`), and `pnpm run build` before calling a part done. Do
   not deploy, do not touch Cloudflare resources or secrets.

Done when it matches the Suno screenshots in structure and colour, every inventory row is ticked, Amharic
renders cleanly at every width, and no old neumorphic or yellow-theme CSS remains.
