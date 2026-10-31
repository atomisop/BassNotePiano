# Speed audit, 2026-10-31

Measured, not guessed: Lighthouse (mobile, the live site for public pages, a local production build for signed-in pages), a CPU
profile of Home loading, a count of what keeps running on idle pages, and every database query a page makes (local query log).

## What the numbers say

| Page | Lighthouse | Main content shows | Phone busy with scripts | Downloaded |
| --- | --- | --- | --- | --- |
| Public home (live) | 41 | 6.7 s | 2.3 s | **16 MB** |
| Login (live) | 67 | 4.0 s | 0.9 s | 640 KB |
| Pricing (live) | 54 | 4.6 s | 2.2 s | 665 KB |
| Signed-in Home (local) | 35 | slow | very high | 1 MB |
| Lessons (local) | 35 | slow | very high | 1 MB |
| Admin Overview (local) | 37 | slow | very high | 1 MB |

## The real causes, biggest first

1. **The homepage video is 11.4 MB, and a second 3.2 MB copy also downloads.** That is 90% of the public home page's weight.
2. **Too many database queries per page.** Signed-in Home makes about 75, the admin Overview about 120. Each one is a round trip to
   the database (Neon), so on the live site they add up. Two are classic "N+1" patterns (one query per item instead of one for all):
   - The automatic-task status runs **one query per task (14)**, and it runs on **every admin page** (for the menu's warning dot).
   - "Progress by scale" runs **two counts per scale (28)**.
   - The same few lookups (pending payments, applications, classes to mark) run 3 times on each admin page.
3. **The "liquid glass" lens draws a distortion image for every glass button on every page** (in Chrome-based browsers; Safari skips
   it). It is the single heaviest function while a page loads.
4. **Lessons runs one animation forever** (about 60 times a second, even when nothing moves on screen).
5. **Public pages are built fresh for every visitor** (0.8 to 1.4 s before the server answers), mostly because of the per-visit
   security nonce. They could be served ready-made from the CDN.
6. About 100 KB of JavaScript loads on every page but is not used on it.

## Already done by the platform (nothing to add)

- **CDN and load balancing:** Netlify serves every file from its global CDN and runs the server on autoscaling functions.
- **Minified JS and CSS, code split into chunks, compressed responses (gzip/brotli):** Next.js and Netlify do this on every build.
- **Lazy loading:** below-the-fold images already use lazy loading; heavy panels are already split out.
- **Loading skeletons:** every main page already has one (`loading.tsx`).
- **Database connection pooling:** worth confirming that the live `DATABASE_URL` uses Neon's pooled address (`-pooler` in the host).
  I cannot see the live settings from here.

## The plan, in order of impact

1. Shrink the homepage video (about 11 MB to about 1.5 MB, the same look) and stop the second copy from downloading.
2. Make the menu's task check one query instead of 14, and progress by scale 2 queries instead of 28. Remove the repeated lookups
   on admin pages. Add database indexes where those queries need them.
3. Make the glass lens draw each size once and reuse it (or only on the dock), instead of once per button.
4. Stop Lessons' endless animation when nothing is happening.
5. Serve the public pages ready-made from the CDN.
6. Remove unused JavaScript from the shared bundle.

Then measure again with the same tools and compare.
