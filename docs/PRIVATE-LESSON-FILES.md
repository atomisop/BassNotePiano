# Private lesson files

Lesson PDFs are paid content. They are now opened through `/api/lessons/[lessonId]/file`, which checks the student's access, stamps
their name and email on every page and is never cached. For that to mean anything, the files must not also be reachable at a
public address. The public bucket also holds profile pictures and website images, so the lessons move to their own private bucket.

## Steps (in this order)

1. **Deploy this change first.** The route works with the old public addresses, so nothing breaks.
2. **Cloudflare > R2 > Create bucket**, name it `bass-note-piano-private`. Do NOT turn on public access or a custom domain for it.
3. **Cloudflare > R2 > Manage API tokens**: edit the existing token (or make a new one) so it can read and write BOTH buckets
   (Object Read & Write, applied to the two buckets). If you make a new token, update the three `R2_*` key values in Netlify too.
4. **Netlify > Site configuration > Environment variables**: add `R2_PRIVATE_BUCKET_NAME` = `bass-note-piano-private`. Redeploy.
5. **Move the existing files** (from the project folder):
   - `node --env-file=.env scripts/move-lessons-private.mjs` shows what it would do.
   - `node --env-file=.env scripts/move-lessons-private.mjs --apply` copies each file, checks the size, then points the lesson at it.
   - Open a lesson as a student and check the PDF shows with your name faintly across it.
6. **Remove the public copies**: `node --env-file=.env scripts/move-lessons-private.mjs --apply --delete-old` (only after step 5 checks out;
   a lesson already moved is skipped, so running it again is safe). After this, the old public links stop working.

New uploads from Admin > Lessons go to the private bucket automatically once step 4 is done.

Not covered: the nightly database backups still go to the public bucket under `backups/`. They are encrypted, and not listed anywhere.
