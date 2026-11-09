# GL-02-01 review: Solid surfaces on public pages, piano lesson and admin at phone width

Reviewer: Claude (self review; owner has not seen it). Local only. No source change in this task.

Captured one at a time in Solid mode: 8 public pages at 1440x900, 390x844 and 320x700; `/practice` and `/practice/piano` at the same three sizes; 12 admin pages at 390x844 and 320x700; WebKit and Firefox on home, pricing and login at 1440 and 390. 66 captures plus the re-runs below. No horizontal overflow, no unexpected redirects, no axe findings of any impact (axe runs at the first size of each run), nothing skipped.

Environment issue found and fixed locally: `/practice/piano` first showed the app's "This page didn't load" screen. Cause: the local throwaway database `bnp_revamp` lacked the branch's own migration `20261124000000_piano_practice_attempts` (saved piano runs), so the page's best-score query failed with P2021. Not a Solid or glass problem. The migration was applied to that local database only (`prisma migrate deploy`, target confirmed as 127.0.0.1:5433/bnp_revamp). The piano captures were then redone; the pictures committed here are the working page, with the keyboard, mode chips and progress bar legible at 320px.

Limits: 15 of the pictures are committed (public pages at 390, piano, two admin pages, WebKit and Firefox login); the rest stay local and are described by the manifests. Axe covers the first size of each run only. The piano exercise itself (musical content, timing) is not reviewed here and needs the teacher's validation per the spec.
