---
name: studio-app-builder
description: Build a complete, production-shaped web app from scratch in the Bass Note Piano (BNP) mould from ONE prompt and ONE colour: a public marketing site, sign-up with emailed codes, a signed-in app with a dock and sidebar, plans and payments, booking, an AI assistant with human handoff, notifications and email, a six-section admin console, scheduled jobs with a watchdog, and a contrast-checked light and dark theme generated from the colour. Use when the user asks to "make an app like BNP", "build a new app from scratch", "clone the BNP setup for <business>", "start a new studio / coaching / tutoring / booking / membership / course app", or gives a one-line business idea plus a colour and wants the whole thing built.
---

# Studio app builder

Turn `<one prompt> + <one colour>` into a working app with the architecture, conventions and polish that Bass Note Piano
reached after hundreds of PRs, without repeating the mistakes that cost it those PRs.

The user gives you as little as: **"A booking app for my dog grooming salon. Teal."** Everything else you decide, write
down, and build. Do not interview them. Ask at most ONE question, and only if the business itself is unclear (you
cannot tell what is sold or to whom). Colour missing: use `orange` and say so.

## The run, in order

Work through these phases in one session. Each ends with something committed. Use a task list (TaskCreate) with one
task per phase so progress is visible.

### 0. Read the references (2 minutes, not optional)

- `references/architecture.md` : stack, repo shape, the patterns every module follows.
- `references/design-system.md` : token contract, hierarchy rules, shapes, motion, accessibility.
- `references/modules.md` : the feature catalogue and which modules a given business needs.
- `references/quality-gates.md` : what "done" means for every phase.

If the BNP repository is reachable (this repo, or `atomisop/bassnotepiano` via the GitHub tools), each reference names the
BNP file that is the reference implementation. **Read that file before writing its counterpart**: port the idea, rename
the domain, drop the BNP-specific parts. Never copy BNP's brand, copy, photos, scales content or logo into the new app.

### 1. Brief (write `PRODUCT.md`)

From the one prompt, decide and write down, in plain words:

- Name (theirs if given; otherwise propose one and mark it "working name"), one-line positioning, who the users are,
  who the operator is (usually one owner who runs everything, like BNP).
- What is sold: pick the **money model** from `modules.md` (subscription of N sessions per 28-day cycle, credit packs,
  one-off bookings, free). Pick the **payment rail**: Stripe Checkout by default; manual bank transfer with emailed bank
  receipts (BNP's Zelle pipeline) only if the user says so.
- The core loop in one sentence ("a client picks a time, pays, shows up, gets a reminder, rebooks").
- Which modules from `modules.md` are IN for v1, which are LATER. Default to the smallest set that runs the business.
- Brand rules: no em dashes in copy; never fabricate testimonials, reviews, ratings or user counts.

Show the brief to the user in ~10 lines and continue without waiting unless something is truly ambiguous.

### 2. Palette (one colour -> both themes)

```bash
node .claude/skills/studio-app-builder/scripts/palette.mjs "<colour>" --out src/app/themes.css --json palette-report.json
```

Accepts a hex or a name (`teal`, `blue`, `violet`, ...). Options: `--default light|dark` (dark is the default, as in
BNP), `--dark-ground black` (pitch-black page, BNP's current look) or `tinted` (default). It writes the ramp contract the
components read and checks every text pair against WCAG 2. Exit code 2 means a pair failed: read the notes (it already
moves danger/success/warning hues away from the accent) and pick a nearby shade rather than hand-editing the CSS. Put the
accent hex, the two grounds and the notes into `DESIGN.md`. Delete `palette-report.json` after reading it.

If the skill folder is not in this repo (a brand-new project), copy the whole `studio-app-builder` folder into the new
repo's `.claude/skills/` first so the script and references travel with the project.

### 3. Scaffold

Follow `architecture.md` "Scaffold" exactly (Next.js App Router + TypeScript + Tailwind 4 + Prisma/Postgres + NextAuth
JWT, Vitest, ESLint, Netlify config, Node pinned). Create the route groups `(marketing)`, `(auth)`, `(dashboard)`,
`(dashboard)/admin`, the `src/lib` pure/DB split, `tests/` and `tests/db/`, and a CI workflow with a Postgres service.
Commit.

### 4. Design system and shell

Build, in this order, from `design-system.md`: `globals.css` `@theme` tokens wired to the generated ramps, the font pair,
`cn()`, `appIcons.ts` (one icon library behind one file), `Button`, `Card` + `CardKit`, `Dialog` (with focus trap),
`Switch`, `ActionMenu`, `EmptyState`, `Toaster`, `BackLink`, then the shell: top bar, sidebar (md+), floating bottom dock
(phones, always visible, `pb-32` on the scroll area), theme toggle. Check at 1440, 768, 390 and 320 px in both themes.
Commit.

### 5. Modules

Build the v1 modules from the brief in the dependency order given in `modules.md` (accounts first, then money, then
booking, then the rest). For each module: schema + hand-written migration, pure rules file with tests, DB file, server
actions / routes, screens, admin side, notices. Run the gates in `quality-gates.md` after each module and commit.

### 6. Operator's console

Six sections, never more: Overview, Billing, People, Schedule (or the domain's word), Inbox, Setup. Defined in one
`adminNav.ts` (tested). Merge pages that describe one job into tabs of one page. The Overview opens with "Needs you".
See `modules.md` "Admin console".

### 7. Production wiring

Scheduled jobs wrapped in `runJob` plus `job-watchdog`, error reporting, email log, backups, staging mode, release
branch. See `architecture.md` "Operations". Write `.env.example` with every variable and a one-line comment each.

### 8. Hand-off docs

Write the new app's `CLAUDE.md` (engineering memory: stack, repo shape, the conventions you actually used, how to verify
a migration, what each module does and where) and `DESIGN.md`. These are what make the NEXT session fast; BNP's
`CLAUDE.md` is the model. Then summarize to the user: what was built, what is LATER, which env vars and accounts they
must create (database, email provider, payment provider, AI key, hosting), and the exact first deploy steps.

## Non-negotiables (each one cost BNP a production incident or a cleanup PR)

1. **Migrations are hand-written SQL, verified against a throwaway Postgres** with `prisma migrate diff` printing an empty
   migration. The build runs `prisma migrate deploy` when `DATABASE_URL` is set, so a merged table is a migrated table.
2. **Pure rules in their own file, tested without a database** (`*Rules.ts`); the DB file imports them. Money, access,
   booking, dates and wording all live in pure files.
3. **Never hard-code a price, a cycle length or a limit** in a screen. One config, read everywhere.
4. **Money and booking actions run once** (idempotency key per attempt) and inside one transaction.
5. **Every scheduled job is wrapped in `runJob`** and watched; a job that silently stops is a bug.
6. **Sessions can be revoked** (`sessionVersion` on the user, checked in the JWT callback). Bans and password changes bump it.
7. **One verification-code system** for every emailed code (sign-up, sign-in, email change, delete account).
8. **Every admin action that touches a customer is audited** and takes a `notify` flag.
9. **Every notice respects the person's switches**; every email a switch governs carries a signed one-click unsubscribe.
10. **Accessibility is a gate**: 16px inputs, 44px touch targets, focus-trapped dialogs, 4.5:1 text in both themes, axe clean.
11. **Copy is plain and true**: no em dashes, no invented social proof, no "i" icons hiding a screen's own message.
12. **`"use server"` files export only async functions and types** (a constant there breaks `next build`, not `tsc`).
    Add BNP's test that scans for this.

## When the user gives more than one prompt's worth

Screenshots, an existing brand, a domain name, a list of prices: fold them into the brief and the palette (pass the brand
colour to the script). A reference app they like: take its layout ideas, never its name, logo, copy or artwork.

## Scope honesty

One session will not reach BNP's depth. Ship the core loop end to end, working and verified, before any LATER module.
Tell the user plainly which modules are stubs, which need their keys, and what was not tested.
