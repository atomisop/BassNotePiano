Gate harness check. rework:verify was exercised on throwaway fixtures: valid evidence passes; an empty screenshot, fake commit SHA and failing test log are rejected.
rework:capture produced real 1440x900, 390x844 and 320x700 screenshots of /pricing from the running dev server (networkidle never settles on this site, so it waits for load plus 2.5s).
Baseline fixes made first: regenerated the Prisma client (stale client caused the notification type errors) and deleted Finder "* 2" duplicates in git-ignored .next-stageshow/.next-revamp that broke tsc.
Observed on /pricing mobile: "Most popular" badge is unsubstantiated (task P1-PAY-01).
Still open for this task: no before screenshots (nothing existed to compare), no state proof, test:db and build not yet run.
