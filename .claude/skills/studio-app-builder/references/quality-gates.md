# Quality gates

A phase is done only when every line below that applies is true. Report honestly which were not run and why.

## Every commit

- [ ] `npm run typecheck` clean
- [ ] `npm run lint` clean
- [ ] `npm test` green (pure tests, including the `"use server"` exports scan and `adminNav` shape test)
- [ ] No em dashes in anything written (`grep -rnP "\x{2014}" src docs *.md` returns only third-party text)
- [ ] No raw hex or px font sizes in components (`grep -rnE "#[0-9a-fA-F]{6}|text-\[[0-9]+px\]" src/components src/app --include=*.tsx`)

## Every schema change

- [ ] Hand-written migration applied to a throwaway local Postgres with `prisma migrate deploy`
- [ ] `prisma migrate diff --from-url ... --to-schema-datamodel ...` prints `-- This is an empty migration.`
- [ ] `npm run test:db` green against that database; drop it afterwards

## Every module that touches money, access or booking

- [ ] Rules in a pure file with unit tests for the edge cases (cycle boundaries, double submit, full slot, paused plan,
      zero amount, refunds)
- [ ] A `tests/db/` test for the transaction (two concurrent calls, one winner)
- [ ] Idempotency key on the client action; server re-checks role and ownership
- [ ] Audit entry; Notify switch on the admin side
- [ ] A security review of the diff by a separate subagent (high-confidence findings only: authz, IDOR, injection, secrets,
      account enumeration, payment tampering) and every real finding fixed

## Every screen

- [ ] Both themes, at 1440, 768, 390 and 320 px: no horizontal scroll, nothing under the dock, no clipped menu
      (screenshot with Playwright at deviceScaleFactor 1 and look)
- [ ] axe-core WCAG 2.2 AA clean
- [ ] Keyboard: every action reachable, dialogs trap focus, Escape closes
- [ ] One focal point per card, one accent button per card, destructive actions in a menu behind a confirm
- [ ] Empty, loading and error states written in plain words

## Before telling the user it is finished

- [ ] `npm run build` passes (with `DATABASE_URL` set to the throwaway DB so the migrate step runs)
- [ ] The core loop from the brief walked end to end in the running app (`npm run dev`, Playwright script or by hand):
      register -> confirm code (read from the dev log) -> the thing that is sold -> admin sees it -> admin acts -> customer
      is notified
- [ ] `CLAUDE.md`, `DESIGN.md`, `PRODUCT.md`, `.env.example` written and current
- [ ] The summary lists: built and verified, built but untested (needs keys), LATER, and the deploy steps
