> **Finished.** This was the brief for the one-off redesign (shipped, see PROGRESS.md). It is kept for history and is not an instruction for new work.

You are a senior product designer and full-stack engineer. Your job is to upgrade my piano learning web app, BassNotePiano, from top to bottom so it looks and feels like a $10,000 custom-built website. Both the user side and the admin side need to be done.

REPO: github.com/atomisop/BassNotePiano (this project folder)
LIVE SITE: bassnotepiano.com
STACK: detect it yourself by reading the repo, and tell me what you find.

REFERENCE SCREENSHOTS (in the reference folder, look at them first)
1. reference/coursera-home.png: how Coursera uses the full screen width on its home page
2. reference/coursera-lesson.png: Coursera's three-zone lesson layout
3. reference/bassnote-home-current.png: my current BassNotePiano home page (what needs fixing)

ABOUT THE APP
- A piano lesson app for students, with an admin panel.
- Main sections: Home, Online Lessons, Friends, Messages, Settings.
- Brand colors: black, white, and green. Keep these. Do not introduce new brand colors. Dark mode is the default.
- The visual style is NEUMORPHISM (soft UI) throughout the whole app, built carefully so it stays readable and usable. See STEP 2C.
- I want it to feel like a premium, native iOS-quality app: soft rounded corners, smooth motion, and well-used space.

THE BIGGEST PROBLEMS
1. My app puts content in one narrow centered column on desktop, and this happens on many pages across the whole app, not just the home page. There are large empty margins on the left and right. Cards stack vertically, so pages feel empty and users have to scroll too much. Coursera fills the screen in a smart, organized way. I want that quality of space usage, with my own brand. Do not copy Coursera's branding, colors, or illustrations.
2. The app feels flat and "default". I want real depth through neumorphic surfaces, a clear signal for what to tap, and bold visual hierarchy. See STEP 2C, which is a core design rule for every screen.

STEP 1: AUDIT FIRST (do not change any code yet)
1. Read the whole repo. Tell me the stack, folder structure, pages, shared components, and how styling is done.
2. List every screen on the user side and the admin side.
3. Tell me what looks inconsistent or dated: layout and wasted space, spacing, fonts, buttons, forms, empty states, loading states, error states, mobile layout.
4. Audit color use: list everywhere green is used today (buttons, badges, streak dots, toggles, borders, highlights, text) and tell me which uses mean "tap this" and which are just decoration.
5. Audit type sizes: list how many different font sizes are used across the app, and where the "in-between" sizes show up.
6. Audit surfaces: list how cards, buttons, inputs, and panels are styled today (borders, backgrounds, shadows), and how many different styles exist.
7. Tell me what could break if we restyle (auth, payments, lesson playback, messaging, admin permissions).
8. Give me a short plan with phases and wait for my "go" before editing.

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
- Color tokens: a single base surface color (needed for neumorphism), ink and paper for text (white and grays), plus ONE signal color, green, with a few tints. Dark mode default with a matching light mode. Follow the rules in STEP 2C.
- Neumorphic tokens: two shadow colors (a light highlight and a dark shade), shadow sizes for three depth levels (low, medium, high), raised and pressed (inset) versions of each, and one light-source direction used everywhere.
- Type scale: follow the extreme-contrast rule in STEP 2C. Use one clean font (like Inter or an SF-style font). Define only three tiers: Hero (huge), Small (tiny), and a body size used only for real reading text like lesson instructions and chat messages. No other in-between sizes.
- Spacing scale and corner radius scale (neumorphism needs generous, consistent rounding).
- Reusable components, all neumorphic: buttons, inputs, toggles, sliders, cards, tabs, modals and bottom sheets, toasts and notifications, avatars, badges, progress bars, skeleton loaders, empty states, bottom tab bar on mobile, top bar or sidebar on desktop.
- Motion rules: short, smooth, purposeful. Press animations move between raised and pressed states. Respect "reduce motion" settings.

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
7. Information density: tighten oversized cards and large empty gaps. Keep generous whitespace between sections, but not inside cards. Neumorphism needs breathing room around raised shapes so shadows do not collide.
8. Before building, show me a simple before and after wireframe (text or diagram) for the Home page and the Lesson page, and wait for my approval. The wireframes must show the three planes, the one Hero element, and which surfaces are raised and which are pressed (STEP 2C).

STEP 2C: NEUMORPHISM, SIGNAL COLOR, AND TYPE CONTRAST (CORE RULES FOR EVERY SCREEN)
These rules decide how every screen looks. They apply together with the layouts from STEP 2B. If a layout choice conflicts with these rules, tell me and propose a fix instead of quietly ignoring either one.

Rule 1: Neumorphism done properly, across the whole app
- Everything is made from one base surface color. Shapes are formed only by a soft light shadow on one side and a soft dark shadow on the other side. Use one consistent light source (for example top-left) across the entire app.
- Dark mode: do NOT use pure black as the base, because neumorphic shadows need room to show. Use a dark charcoal that still reads as black, with a visible but subtle highlight shadow. Light mode: a soft light gray base. Define both and make sure the effect looks good in both.
- Two surface states, used with clear meaning:
  - Raised (extruded): things you can press or move, like buttons, cards you can open, tabs, toggles, and the piano keys at rest.
  - Pressed (inset): things that are held, filled, or selected, like text inputs, progress bar tracks, the selected tab, pressed buttons, wells that hold content, and pressed piano keys.
- Use three depth levels (low, medium, high) from the design tokens only. Never invent one-off shadows on individual components.
- Apply it to the whole app, user side and admin side, so nothing looks like a different product.

Rule 2: Guardrails so neumorphism stays usable (these are required, not optional)
- Neumorphism makes things look alike, so never rely on shadows alone to show that something is tappable. Tappable things also get an icon, a label, or the signal green (Rule 3).
- All text must keep strong contrast against the base surface (at least 4.5 to 1 for normal text, 3 to 1 for large text). Never put light-gray text on a light-gray surface or dark-gray on dark-gray to look "soft".
- Every interactive element needs a clearly visible focus ring for keyboard users, and a visible pressed state for touch users.
- Inputs and controls need enough edge definition to be recognized (a subtle inner shadow plus a faint outline is fine).
- Data-heavy screens (admin tables, long lists, chat history) use restraint: the table or list sits in one pressed or raised container, and the rows inside stay flat with simple dividers. Do not make every row its own raised card.
- Limit how many shadowed elements are on screen at once, and avoid stacking raised shapes inside raised shapes.
- Performance: build shadows from shared CSS variables, avoid animating large blurred shadows on many elements at once, and test scrolling on a real phone or a throttled mobile profile.
- Tell me honestly if any screen cannot meet these rules in a pure neumorphic style, and propose the smallest exception.

Rule 3: One signal color
- Green means exactly one thing: "you can tap this". Primary buttons, links, active tabs, selected items, active piano notes, and interactive icons can be green.
- Everything else is ink and paper: black, white, and grays. No decorative green anywhere (no green borders, no green dots just for style, no green headings).
- Status needs (success, warning, error) must not use the signal green as decoration. Show status with icons and text, so green never means "just information".
- One primary green action per screen section at most, so the user never wonders what to tap.
- Disabled and locked items (like locked scales) are gray and pressed flat, never green.
- Use the Step 1 color audit to find and fix every place that breaks this rule.

Rule 4: Three planes of depth
Every screen has three layers so it feels deep:
- Back plane: big type. Very large, low-contrast text or numbers pressed into the base surface like an engraving (for example a huge scale name, a huge step count, or a huge greeting), subtle enough that it never fights with the content in front.
- Middle plane: the subject. The thing the user came for: the lesson, the piano keyboard, the scale card, the chat. It sits as a raised or pressed panel and overlaps the big type slightly so the layers feel connected.
- Front plane: the controls. Buttons and tappable items are the most raised elements, with the green signal color, so they feel closest to the user's finger.
On small screens, simplify the back plane so text stays readable. Never put the back plane text behind small body text that has to be read.

Rule 5: Extreme type contrast (no middle sizes)
- On each screen, make ONE thing huge: the Hero element (for example the greeting, the current scale name, or the progress number).
- Everything else is small and tidy.
- Skip the middle sizes. No medium headings competing with each other. Group and label things with spacing, weight, and small uppercase labels instead of mid-size headings.
- Body size is allowed only for real reading text (lesson instructions, chat messages, descriptions).
- Check that the huge Hero size scales down smoothly on phones and never overflows or wraps awkwardly.
- Small text must still be readable: never smaller than about 12px, and it must keep strong contrast.

STEP 3: COMPONENT SOURCES
Use 21st.dev as the main source for polished React and Tailwind components (use the 21st.dev Magic MCP if it is available in your tools; if not, tell me exactly which components you want and I will paste them in). Also draw from shadcn/ui, Aceternity UI, Magic UI, and Radix primitives for behavior and accessibility. Rules:
- Search for neumorphic or soft-UI components first, but expect to restyle most of them. Use Radix or shadcn primitives for behavior and keyboard accessibility, and put my neumorphic tokens on top.
- Check each component's license and note where it came from.
- Restyle every borrowed component to my base surface, ink and paper, and one signal green system, and to the rules in STEP 2C, so nothing looks pasted in.
- Do not add heavy libraries for small effects. Keep the app fast.

STEP 4: REDESIGN EVERY SCREEN (using the layouts from Steps 1B and 2B and the rules from STEP 2C)
For each screen, name its Hero element, its three planes, which surfaces are raised and which are pressed, and which items are green (tappable) before building it.
- Home: Hero is the greeting or progress. Include the "continue where you left off" card, next lesson, streak, badges.
- Online Lessons: beautiful lesson cards, clear progress, and a distraction-free three-zone lesson page. Hero is the current scale or step name.
- Friends and Messages: clean lists, real-time feel, nice empty states, tidy chat bubbles (decide the raised and pressed treatment in the wireframe). On desktop, use a two-pane layout (list on the left, conversation on the right).
- Settings: grouped sections like iOS settings, with neumorphic toggles and a side menu on desktop.
- Onboarding: a short first-run tutorial that explains the app in a few friendly steps, one big Hero statement per step.
- Notifications: consistent, well-designed templates for every kind of notification and toast.
- Admin panel: same neumorphic family as the user side, but with the restraint rules from STEP 2C Rule 2. Clean tables, search, filters, bulk actions, and easy lesson and student management, using the full screen width.
- Mobile first in thinking, but desktop must never look empty.

STEP 5: PIANO EXPERIENCE (the heart of the app)
- Make the on-screen keyboard the middle-plane star, and a showpiece of the neumorphic style: soft raised keys at rest, a smooth move to the pressed (inset) state when played, and green only on active or pressed notes (green means "touch or playing here"). Keep key edges clear enough that every key is easy to see and hit.
- Correct touch handling with no lag, and keep audio latency as low as possible.
- Do not change any scale, chord, or note logic in this phase. Only change how it looks.

STEP 6: QUALITY BAR
- Accessibility: contrast checks on every screen in both dark and light mode, visible focus states, labels on all controls, keyboard navigation.
- Performance: fast load, lazy-load heavy parts, optimized images. Shadows and depth effects must not slow down phones.
- Every screen needs loading, empty, and error states.
- Final check of STEP 2C on every screen: consistent light source, raised and pressed used with clear meaning, three planes present, green only on tappable things, one Hero element, no in-between type sizes.
- No broken features. Test login, lessons, friends, messages, settings, and admin after every phase.
- Clean, readable code with no duplicated styling.

HOW TO WORK
- Work in phases. After each phase, give me a plain-language summary of what changed and what to test.
- Deliver code in complete logical blocks (whole components or whole files), not scattered snippets.
- Use plain language when you explain things to me. Avoid jargon.
- Never hard-code a narrow width on an individual page. Always use the shared layout wrappers so the width stays consistent across the whole app.
- Never hard-code colors, shadows, or font sizes on individual components. Always use the design tokens so the neumorphic style, the signal color, and the type rules stay consistent.
- If a choice would change how the app behaves (not just how it looks), ask me before doing it.
- Never delete data or change the database structure without asking first.

OPTIONAL LATER PHASE (only after the redesign is approved)
My lesson PDFs on Ethiopian scales (Tizita major/minor, Bati, Ambassel) use formulas that the app's scale and chord logic and virtual instruments do not match yet. I want to update the app to follow the PDFs, and grow from 6 scale groups to 15, with one standalone scale per module and no bundled variants. Do not start this until I say so.

Start with STEP 1 now.
