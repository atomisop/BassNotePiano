You are a senior product designer and full-stack engineer. Your job is to upgrade my piano learning web app, BassNotePiano, from top to bottom so it looks and feels like a $10,000 custom-built website. Both the user side and the admin side need to be done.

REPO: github.com/atomisop/BassNotePiano
LIVE SITE: bassnotepiano.com
STACK: [fill in, e.g. React / Next.js / Firebase / Supabase. If unsure, detect it from the repo.]

ATTACHED SCREENSHOTS (in the reference folder)
1. Coursera home page (reference for how to use the full screen width)
2. Coursera lesson page (reference for the three-zone lesson layout)
3. My current BassNotePiano home page (what needs fixing)

ABOUT THE APP
- A piano lesson app for students, with an admin panel.
- Main sections: Home, Online Lessons, Friends, Messages, Settings.
- Brand colors: black, white, and green. Keep these. Do not introduce new brand colors. Dark mode is the default.
- I want a clean, native iOS feel: soft rounded corners, subtle depth, smooth motion, and well-used space.

THE BIGGEST PROBLEMS
1. My app puts content in one narrow centered column on desktop, and this happens on many pages across the whole app, not just the home page. There are large empty margins on the left and right. Cards stack vertically, so pages feel empty and users have to scroll too much. Coursera fills the screen in a smart, organized way. I want that quality of space usage, with my own brand. Do not copy Coursera's branding, colors, or illustrations.
2. The app feels flat and "default". I want real depth, a clear signal for what to tap, and bold visual hierarchy. See STEP 2C, which is a core design rule for every screen.

STEP 1: AUDIT FIRST (do not change any code yet)
1. Read the whole repo. Tell me the stack, folder structure, pages, shared components, and how styling is done.
2. List every screen on the user side and the admin side.
3. Tell me what looks inconsistent or dated: layout and wasted space, spacing, fonts, buttons, forms, empty states, loading states, error states, mobile layout.
4. Audit color use: list everywhere green is used today (buttons, badges, streak dots, toggles, borders, highlights, text) and tell me which uses mean "tap this" and which are just decoration.
5. Audit type sizes: list how many different font sizes are used across the app, and where the "in-between" sizes show up.
6. Tell me what could break if we restyle (auth, payments, lesson playback, messaging, admin permissions).
7. Give me a short plan with phases and wait for my "go" before editing.

STEP 1B: FIND AND FIX THE GLOBAL NARROW-COLUMN PROBLEM
Before redesigning anything, find what is forcing the narrow width:
1. Search the whole codebase for the cause: a root layout or app shell wrapper, a shared container component, global CSS (max-width, width, margin: 0 auto, fixed pixel widths), Tailwind classes like max-w-md, max-w-xl, max-w-2xl, max-w-3xl, mx-auto, or per-page wrappers that repeat the same constraint.
2. Give me a list of every file and page where a narrow width is applied, and say which ones come from one shared source and which are set separately on each page.
3. Propose a fix with these rules:
   - Remove the narrow width from the global shell. The shell should let content use the full screen width, up to a wide maximum (about 1400 to 1600px) with side padding.
   - Create a small set of layout wrappers to use everywhere instead of ad-hoc widths:
     a. Wide: for dashboards and the lesson page (full width up to the max).
     b. Two-pane: for Messages and Friends (list on the left, detail on the right).
     c. Settings layout: side menu plus content.
     d. Narrow: only for things that truly should be narrow, like login, sign-up, onboarding steps, and short forms.
   - Every page must be assigned to one of these wrappers on purpose. Nothing should be narrow by accident.
4. Show me the list of pages with the wrapper you plan to give each one, and wait for my approval before changing anything.
5. After approval, fix the global shell first, then check every page at 390, 768, 1024, 1440, and 1920 pixel widths so nothing breaks or stretches awkwardly (for example, text lines that are too long, or forms that become too wide).

STEP 2: DESIGN SYSTEM
Build one consistent design system before touching individual pages:
- Color tokens: ink and paper (black, white, and neutral grays) plus ONE signal color, green, with a few tints. Dark mode default with a matching light mode. Follow the signal color rule in STEP 2C.
- Type scale: follow the extreme-contrast rule in STEP 2C. Use one clean font (like Inter or an SF-style font). Define only three tiers: Hero (huge), Small (tiny), and a body size used only for real reading text like lesson instructions and chat messages. No other in-between sizes.
- Spacing scale, corner radius scale, shadow scale, and a layering scale (z-index and depth) for the three planes in STEP 2C.
- Reusable components: buttons, inputs, cards, tabs, modals and bottom sheets, toasts and notifications, avatars, badges, skeleton loaders, empty states, bottom tab bar on mobile, top bar or sidebar on desktop.
- Motion rules: short, smooth, purposeful. Respect "reduce motion" settings.

STEP 2B: LAYOUT AND SPACE USAGE (HIGH PRIORITY, applies to every screen)
What to learn from the Coursera screenshots:
- Home page: a top navigation bar with the main sections in a horizontal row. Below it, a two-column layout: a wide main column (about 2/3) for the learning list, and a narrower right panel (about 1/3) for the calendar and weekly stats. Content fills the screen width up to a sensible maximum. Nothing important is hidden below the fold.
- Lesson page: three zones. Left is the course outline with progress checks. The center is the lesson itself, as large as possible. A thin right rail holds tools (Transcript, Notes, Files). The outline can be closed to give the lesson more room.
- Cards are compact, with a clear title, a small info line, a progress bar, and one obvious button.
- Section tabs (In Progress, Completed, Skills, Certificates) keep everything on one page without long scrolling.

What to build for BassNotePiano:
1. Desktop shell: a wide max-width container (about 1400 to 1600px) with proper side padding, using the shared wrappers from Step 1B. Use a top bar or a left sidebar for Home, Online Lessons, Friends, Messages, Settings. Decide which fits the app better after the audit.
2. Home page, desktop: two columns.
   - Main column: greeting, "Your next step" card with Continue, the learning path as a grid of scale cards (3 or 4 per row), and tabs to switch views (In Progress, Completed, Badges).
   - Right panel: streak calendar, badges earned, stats (scales done, steps, streak, class credits), and upcoming class or lesson info. Stats live in this panel instead of taking a full-width row.
   - The first screen should show the next step, the stats, and at least the first row of scale cards without scrolling.
3. Lesson page, desktop: three zones.
   - Left: collapsible module outline with progress checkmarks.
   - Center: the lesson content and the piano, as large as possible.
   - Right: a thin tool rail (for example Notes, Scale Chart, PDF or Files, Metronome). Panels slide open and the center area resizes smoothly.
4. Tablet: the right panel moves under the main content, and the outline becomes a drawer.
5. Phone: single column with a bottom tab bar, the outline as a bottom sheet, and the tool rail as a row of icons under the lesson. It should feel like a native iOS app.
6. Responsive rules: use CSS grid and flexbox with clear breakpoints. Test at 390, 768, 1024, 1440, and 1920 pixel widths. At no width should there be large dead areas or cramped content.
7. Information density: tighten oversized cards and large empty gaps. Keep generous whitespace between sections, but not inside cards.
8. Before building, show me a simple before and after wireframe (text or diagram) for the Home page and the Lesson page, and wait for my approval. The wireframes must show the three planes and the one Hero element from STEP 2C.

STEP 2C: DEPTH, SIGNAL COLOR, AND TYPE CONTRAST (CORE RULES FOR EVERY SCREEN)
These three rules decide how every screen looks. They apply together with the layouts from STEP 2B. If a layout choice conflicts with these rules, tell me and propose a fix instead of quietly ignoring either one.

Rule 1: Three planes of depth
Every screen is built in three layers so the screen feels deep, not flat:
- Back plane: big type. Very large, low-contrast text or numbers sitting behind the content (for example a huge scale name, a huge step count, or a huge greeting), subtle enough that it never fights with the content in front.
- Middle plane: the subject. The thing the user came for: the lesson, the piano keyboard, the scale card, the chat. It overlaps the big type slightly so the layers feel connected.
- Front plane: the controls. Buttons and tappable items sit on top, with a clear shadow or glow so they feel closest to the user's finger.
Use real overlap, soft shadows, and subtle blur or parallax for depth. Do not fake depth with heavy borders. On small screens, simplify the back plane so text stays readable. Never put the back plane text behind small body text that has to be read.

Rule 2: One signal color
- Green means exactly one thing: "you can tap this". Primary buttons, links, active tabs, selected items, active piano notes, and interactive icons can be green.
- Everything else is ink and paper: black, white, and grays. No decorative green anywhere (no green borders, no green dots just for style, no green headings).
- Status needs (success, warning, error) must not use the signal green as decoration. Show status with icons and text, and use a clearly different treatment so green never means "just information".
- One primary green button per screen section at most, so the user never wonders what to tap.
- Disabled and locked items (like locked scales) are gray, never green.
- Use the Step 1 color audit to find and fix every place that breaks this rule.

Rule 3: Extreme type contrast (no middle sizes)
- On each screen, make ONE thing huge: the Hero element (for example the greeting, the current scale name, or the progress number).
- Everything else is small and tidy.
- Skip the middle sizes. No medium headings competing with each other. Group and label things with spacing, weight, and small uppercase labels instead of mid-size headings.
- Body size is allowed only for real reading text (lesson instructions, chat messages, descriptions).
- Check that the huge Hero size scales down smoothly on phones and never overflows or wraps awkwardly.
- Check accessibility: small text must still meet contrast and minimum readable size rules (never smaller than about 12px, and small text must keep strong contrast).

STEP 3: COMPONENT SOURCES
Use 21st.dev as the main source for polished React and Tailwind components (use the 21st.dev Magic MCP if it is available in your tools; if not, tell me exactly which components you want and I will paste them in). Also draw from shadcn/ui, Aceternity UI, Magic UI, and Radix primitives. Rules:
- Check each component's license and note where it came from.
- Restyle every borrowed component to my ink, paper, and one signal green system, and to the type and depth rules in STEP 2C, so nothing looks pasted in.
- Do not add heavy libraries for small effects. Keep the app fast.

STEP 4: REDESIGN EVERY SCREEN (using the layouts from Steps 1B and 2B and the rules from STEP 2C)
For each screen, name its Hero element, its three planes, and which items are green (tappable) before building it.
- Home: Hero is the greeting or progress. Include the "continue where you left off" card, next lesson, streak, badges.
- Online Lessons: beautiful lesson cards, clear progress, and a distraction-free three-zone lesson page. Hero is the current scale or step name.
- Friends and Messages: clean lists, real-time feel, nice empty states, tidy chat bubbles. On desktop, use a two-pane layout (list on the left, conversation on the right).
- Settings: grouped sections like iOS settings, with a side menu on desktop.
- Onboarding: a short first-run tutorial that explains the app in a few friendly steps, one big Hero statement per step.
- Notifications: consistent, well-designed templates for every kind of notification and toast.
- Admin panel: same quality as the user side, with clean tables, search, filters, bulk actions, and easy lesson and student management, using the full screen width.
- Mobile first in thinking, but desktop must never look empty.

STEP 5: PIANO EXPERIENCE (the heart of the app)
- Make the on-screen keyboard the middle-plane star: realistic but minimal keys, soft press animation, green only on active or pressed notes (green means "touch or playing here"), correct touch handling with no lag.
- Keep audio latency as low as possible.
- Do not change any scale, chord, or note logic in this phase. Only change how it looks.

STEP 6: QUALITY BAR
- Accessibility: good contrast, visible focus states, labels on all controls, keyboard navigation.
- Performance: fast load, lazy-load heavy parts, optimized images. Depth effects (blur, parallax, shadows) must not slow down phones.
- Every screen needs loading, empty, and error states.
- Final check of STEP 2C on every screen: three planes present, green only on tappable things, one Hero element, no in-between type sizes.
- No broken features. Test login, lessons, friends, messages, settings, and admin after every phase.
- Clean, readable code with no duplicated styling.

HOW TO WORK
- Work in phases. After each phase, give me a plain-language summary of what changed and what to test.
- Deliver code in complete logical blocks (whole components or whole files), not scattered snippets.
- Use plain language when you explain things to me. Avoid jargon.
- Never hard-code a narrow width on an individual page. Always use the shared layout wrappers so the width stays consistent across the whole app.
- Never hard-code colors or font sizes on individual components. Always use the design tokens so the signal color and type rules stay consistent.
- If a choice would change how the app behaves (not just how it looks), ask me before doing it.
- Never delete data or change the database structure without asking first.

OPTIONAL LATER PHASE (only after the redesign is approved)
My lesson PDFs on Ethiopian scales (Tizita major/minor, Bati, Ambassel) use formulas that the app's scale and chord logic and virtual instruments do not match yet. I want to update the app to follow the PDFs, and grow from 6 scale groups to 15, with one standalone scale per module and no bundled variants. Do not start this until I say so.

Start with STEP 1 now.
