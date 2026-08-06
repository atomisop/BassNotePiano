# Bass Note Piano — Course Player & Admin Lesson Upload

**To: Claude Code, running in this repo.**
**Prerequisite: Dynamic Glass (`REDESIGN_BRIEF.md`) is already shipped.** Build this entirely inside that system — `.glass-surface` / `.glass-surface-elevated` / `.glass-pill`, `<PhotoBackdrop>`, the established motion values, `Playfair Display` + `Inter`, `amber-400` accent. This is a new feature, not a restyle: it replaces the current bare `/scales/[scaleSlug]` page (two checklist buttons + an inline quiz) with a structured, sectioned course player, plus an admin-only lesson upload flow to feed it real content.

## Reference — what this is modeled on

The reference screenshots are a university LMS course player (Vector Solutions). Copy the *structure and interaction pattern* below, not the visual skin — reskin every element in Dynamic Glass (dark backdrop photography + frosted glass), not the reference's white cards and corporate blue.

1. **Course overview** — a hero banner (title, one-line description, a big "Continue Course" / "Start" action) above a **Course Sections** list showing overall progress (`n / total complete`, plus a compact dot-per-section progress strip). Each row: an icon, the section title, an estimated duration, a "Required" tag, and a status pill (`Completed` / in-progress with a play affordance / `Locked`). Locked rows are visually dimmed and show *why* — "Complete '<previous section>' to unlock."
2. **Lesson view** — clicking an unlocked section opens its content full-width: a video with a real control bar (play/pause, volume, seek-back, running title + subtitle line, elapsed/total time, captions toggle, settings, fullscreen), or a PDF rendered inline. A back control returns to the section list.
3. **Section-complete celebration** — a centered "Congratulations! You've finished this section." card with `Next Section` and `Course Details` actions.
4. **Final assessment** — its own section at the end of the list, gated behind everything above it. Results render as a scorecard: your score, the minimum to pass, colored red/gray on a fail with a `Retake` path back into the section list, green on a pass, with `Finish`.

## Scope: `/scales/[scaleSlug]`

Rebuild this page (`src/app/(dashboard)/scales/[scaleSlug]/page.tsx`) around the pattern above:

- **Header** — scale code, title, kiñit name (unchanged data, `SCALE_GROUPS`/`ScaleGroup`), one-line description, and a primary CTA whose label follows the same logic already used in `ScaleRoadmap`'s `ctaLabel` (`Start` / `Continue` / `Review`) — reuse that logic, don't reinvent it.
- **Course Sections list** — ordered: every admin-uploaded `Lesson` for this scale group, in `order`, followed by the existing scale-spelling quiz reframed as a **Final Assessment** section. Sequential gating: section *n+1* is locked until section *n* is complete, same "why it's locked" messaging as the reference. A lesson with no admin upload yet renders as a **`Lesson coming soon`** row — visually distinct from a sequence-locked row (no lock icon, just clearly not-yet-available) and does not block whatever comes after it in the same way a real incomplete lesson would once it's uploaded.
- **Lesson player** — opens in place of the list (or a full-panel view, your call on routing vs. in-page state) inside a `.glass-surface-elevated` panel over the scale's backdrop. Video: native `<video>` with a custom control bar built to the reference's layout (play/pause, volume, ±15s seek, title/subtitle text, elapsed/total, fullscreen — captions/settings only if the uploaded file actually has tracks, don't fake controls with no function behind them). PDF: inline embed (`<iframe>`/`<object>` pointed at the stored file URL is fine — no need for a heavier PDF.js integration unless page-level tracking matters). A lesson counts as complete on video-ended (or a manual "Mark as complete" fallback for scrubbing-heavy viewers) and on PDF-opened.
- **Section-complete celebration** — reuse `SuccessGlowPulse`/`CountUpNumber`/the spring values already established in `QuizModal.tsx`, don't build a second animation language for this. `Next Section` advances the list; `Course Details` returns to the section-list view.
- **Final Assessment** — this is the *existing* quiz system (`QuizLauncher`, `QuizModal`, `submitQuizAction`, `gradeQuiz`, the `QUIZ_PASS_THRESHOLD` in `access.ts`) — don't rebuild it, just re-home it as the last row in the section list instead of a floating button. Worth one small addition to `QuizModal`'s result step to match the reference's scorecard: show the actual score against the minimum pass threshold explicitly (`Your score: 6/8 · 80% required`), not just pass/fail — currently it shows correctness count but not the threshold comparison.

## Data model — new `Lesson` content, admin-authored

Add to `prisma/schema.prisma`:

```prisma
enum LessonMediaType {
  VIDEO
  PDF
}

model Lesson {
  id              String          @id @default(cuid())
  scaleGroupId    String
  scaleGroup      ScaleGroup      @relation(fields: [scaleGroupId], references: [id], onDelete: Cascade)
  order           Int
  title           String
  description     String?
  type            LessonMediaType
  fileUrl         String
  fileName        String
  fileSizeBytes   BigInt?
  durationSeconds Int?            // video only, read from the file or left null for PDFs
  uploadedById    String
  uploadedBy      User            @relation(fields: [uploadedById], references: [id])
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt

  @@unique([scaleGroupId, order])
  @@index([scaleGroupId])
}

model LessonProgress {
  id          String    @id @default(cuid())
  userId      String
  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  lessonId    String
  lesson      Lesson    @relation(fields: [lessonId], references: [id], onDelete: Cascade)
  completedAt DateTime?

  @@unique([userId, lessonId])
  @@index([userId])
}
```

Adapt field names/shape if a cleaner fit turns up during implementation — the important parts are: lessons belong to a `ScaleGroup`, are explicitly ordered, carry a media type, and per-user completion is tracked separately from the existing `ScaleProgress` checklist so lesson completion doesn't collide with it.

Fold lesson completion into the existing checklist rather than running two parallel systems: once every `Lesson` for a scale group has a `LessonProgress` row for the current user, treat that as equivalent to the current `moduleRead` flag (either set it automatically via the same `markModuleRead` path, or retire the manual "Mark module as read" button entirely now that there's real content driving it — retiring it is the better outcome, the button was always a stand-in for content that didn't exist yet). Leave `practiceCompleted` and the quiz exactly as they are.

## Admin: lesson upload

New admin surface — add a `Lessons` entry to `AdminNav` (`src/components/admin/AdminNav.tsx`) pointing at a new `/admin/lessons` route, structured like the existing admin pages (`admin/students`, `admin/payments`): a scale-group picker, the current lesson list for that scale (reorderable, deletable), and an **"Upload a lesson"** action that opens a form — title, order, file (video or PDF), optional description. Admin-only at every layer: don't render the nav entry or the route's content for non-admins, and re-check `session.user.role === "ADMIN"` server-side in whatever server action handles the upload — never trust a client-side role check alone, same pattern already used for the other admin routes in this codebase.

**On "no size limit":** worth being direct about this rather than quietly working around it — Netlify's serverless functions cap request bodies at a few MB, so routing an upload *through* one, at any size, isn't viable regardless of what the app's own code allows. The correct way to get genuinely large video files in without that ceiling is a **direct-to-storage upload**: the server issues a short-lived presigned upload URL, the admin's browser uploads the file straight to object storage (bypassing your server entirely), and only the resulting file URL + metadata gets written to Postgres via the `Lesson` model. Cloudflare R2 is a reasonable default — S3-compatible (so the standard `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` packages work unmodified), no egress fees, a per-object limit in the terabytes that this use case will never approach. This needs new env vars (account ID, access key, secret, bucket name) — add them to `.env.example` alongside the existing ones. The end result is what "no size limit" actually means here: nothing in this app imposes one.

Show upload progress on the admin form (the browser `XMLHttpRequest`/`fetch` upload-progress event against the presigned PUT) — a raw "uploading…" spinner with no feedback on a large video file reads as broken, not as "no limit."

## Visual & motion notes

- Course-section rows: `.glass-surface`, same border/shadow language as everything else — no new card style.
- The one primary CTA per screen (`Continue Course` on the hero, `Retake`/`Finish` on the assessment result) gets `.glass-surface-elevated` treatment where it's a panel, `.cta-sheen` where it's a button — same rule as the rest of the system, not a new exception.
- Locked/coming-soon rows: lower opacity + `cursor-not-allowed`, but still keep visible focus rings for keyboard users tabbing through the list — don't make them unreachable, just non-actionable.
- Section-list entrance: reuse the existing stagger pattern (`staggerChildren: 0.06–0.08`, spring `stiffness 240–260, damping 24–26`) already used in `ScaleRoadmap`.
- Respect `prefers-reduced-motion` throughout, same as everywhere else in this codebase — this isn't optional just because it's a new feature.

## Execution order

1. Schema: add `Lesson`/`LessonProgress`/`LessonMediaType`, migrate, regenerate the Prisma client.
2. Object storage: wire up R2 (or your preferred S3-compatible provider) with presigned-upload support, env vars documented in `.env.example`.
3. Admin lesson upload: `/admin/lessons` route, form, list, reorder/delete, admin-only guard server-side.
4. Course player: rebuild `/scales/[scaleSlug]` as the sectioned list + lesson player + celebration screen, re-homing the existing quiz as the Final Assessment section.
5. Fold lesson completion into the existing progress model; retire or repurpose the manual "Mark module as read" button.
6. `npx tsc --noEmit` clean, then a full `npm run build` locally (confirm it completes — my sandbox couldn't finish one).
7. Self-review: as a student, walk one scale start to finish (locked → lesson → complete → next lesson → final assessment → pass and fail paths); as an admin, upload a lesson and confirm a non-admin never sees the upload UI or route.
