# Plan: Next.js 14 to 15 (security upgrade)

## Why
`npm audit` lists critical and high advisories against Next 14.2.35, the last 14.x release (remote code execution in the image
optimizer with AVIF files and on Windows-hosted servers, denial of service through Server Actions and Server Components, cache
confusion, SSRF in rewrites and Server Actions on custom servers). The fixes are in Next 15.5.24 or newer. There is no patched 14.x.

## How exposed we are today (checked 2026-10-14)
- Windows RCE: not reachable, the site runs on Netlify.
- Image optimizer RCE: needs the optimizer to process an attacker's AVIF file. `images.remotePatterns` allows only
  `images.unsplash.com` and AVIF is not enabled, so we believe it is not reachable.
- Denial of service and cache issues: reachable in principle. Netlify runs the app behind its own platform, which narrows some of them.
This is why the upgrade is a planned project, not an emergency patch. Do not leave it for months.

## What changes in the app
Counts are from the code on 2026-10-14.
- Request APIs become async: `cookies()` and `headers()` (6 call sites, 6 files import `next/headers`), `params` in 8 pages, routes and
  layouts, and `searchParams` in 18 pages. Each needs `await`. Next ships a codemod: `npx @next/codemod@latest upgrade`.
- React 19 for the App Router (react, react-dom, @types/react). Check: react-pdf 9 (ok), framer-motion 11 (move to the 12 line),
  every `forwardRef` and `use*` library, the 21st.dev components copied in, and Radix.
- `next-auth` 4.24.15 lists Next 15 and 16 as supported peers (ok). `@sentry/nextjs` 10.x supports Next 15 (ok). `@netlify/plugin-nextjs`
  v5 supports Next 15 (ok).
- Caching defaults flip: `fetch` and GET route handlers are no longer cached by default (good for us, but check the few routes that
  relied on it), and `staleTimes.dynamic = 0` stays as set.
- `eslint-config-next` moves to 15.

## Steps (one batch, own branch, own PR)
1. Branch from main. Run the codemod, then upgrade react, react-dom, types, framer-motion.
2. Fix type errors; add `await` to every request API.
3. `tsc`, `next lint`, 277+ unit tests, 134 database tests, clean build.
4. Run the app locally (`next-dev-verify`) and walk: sign-in with the emailed code, password sign-in, Discord connect, lessons
   booking, payment sheet, a lesson PDF (watermark route), the admin screens, Atom chat, the inbound email routes.
5. Netlify deploy preview is off, so test the real build once with `netlify build` or a throwaway site before merging to main.
6. Security review of the diff (auth and request handling changed).
7. Merge, watch GlitchTip and the job watchdog for a day.

## Rollback
Revert the merge commit. There are no database changes in this upgrade, so rolling back is safe.

## Risks
- Anything reading `params` or `searchParams` without `await` fails at runtime only on that page, so the page walk in step 4 matters.
- A library that does not support React 19 yet. Check before starting; stop and report if one blocks.
