# Releases: how code goes live

## The short version

- Merging a pull request into `main` **does not put it on the live site anymore.**
- Once a day, around 4 AM Eastern, a GitHub job called **Release to production** moves a branch named `release` up to `main`.
  Netlify's live site is built from `release`, so that is the moment new code goes live.
- Pull requests still get their own free preview from Netlify, so you can test before you merge.

**Why:** Netlify charges 15 credits for every production deploy. Fifty merges in nine days used three quarters of a month's 1,000
credits, and every top-up is $5. Merging as often as you like is fine now; only the daily release costs credits, and a day with no new
code costs nothing (the job does nothing, and Netlify skips a build when only docs or tests changed, see `netlify.toml`).

## Shipping something right now

GitHub > **Actions** > **Release to production** > **Run workflow** (the GitHub phone app has the same button).

It waits for the checks on the newest `main` commit if they are still running, then releases that commit. If the checks failed,
nothing ships and the run turns red. A manual release costs 15 credits like any other deploy, so batch if you can.

## What the job does and never does

- Ships the newest `main` commit only if CI passed on that exact commit.
- Does nothing when nothing new landed on `main` since the last release.
- Only moves `release` forward. It never rewinds or force-pushes: if `release` somehow holds a commit that `main` does not, the run
  stops red and changes nothing.
- The run's summary page lists every commit that went live in that release.
- The logic is `scripts/release-to-production.sh`, tested in `tests/releaseScript.test.ts`.

A database migration reaches the live database when the release **builds** (the build runs `prisma migrate deploy`), not when the
pull request merges. The code and its migration always go together.

## One-time Netlify setup

Do these in order, after this change has been merged:

1. GitHub > Actions > Release to production > **Run workflow** once. That creates the `release` branch from `main`. (Nothing changes on
   the live site yet, because Netlify still deploys `main`.)
2. Netlify > Site configuration > Build & deploy > Continuous deployment > Branches and deploy contexts > Edit settings:
   - **Production branch:** `release`
   - **Branch deploys:** "Let me add individual branches", with only `staging` in the list if you use staging (`docs/STAGING.md`).
     Do **not** add `main`: a build of `main` would run with the wrong settings and the builds are not needed.
   - **Deploy Previews:** "Automatically build deploy previews for all pull requests". Pull requests are made against `main`, which is
     no longer the production branch, so the other option would stop previews.
3. Check Site configuration > Environment variables: the live `DATABASE_URL` and `DIRECT_URL` should apply to the Production context
   (and `staging` keeps its own values, as in `docs/STAGING.md`).
4. Run the workflow once more after the next merge and watch Netlify > Deploys: the newest production deploy should say it came from
   the `release` branch.

## What is live right now

- Netlify > Deploys shows the production deploy and its commit.
- `git log origin/release -1` is the exact commit that is live (or will be, once Netlify finishes building it).

## Undoing

- **A bad release:** Netlify > Deploys > an older deploy > Publish deploy puts the old site back at once. Tomorrow's release would
  put the newest `main` on again, so also revert the bad commit on `main`.
- **Back to deploying on every merge:** set Netlify's Production branch to `main` again and disable the workflow
  (Actions > Release to production > the three dots > Disable workflow).
