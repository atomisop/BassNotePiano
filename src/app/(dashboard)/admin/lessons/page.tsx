import Link from "next/link";
import { SCALE_GROUPS } from "@/lib/curriculum";
import { getLessonsForScale } from "@/lib/courseContent";
import { isObjectStorageConfigured } from "@/lib/storage";
import { AdminLessonManager } from "@/components/admin/AdminLessonManager";
import { requestLessonUploadUrlAction, createLessonAction, deleteLessonAction, reorderLessonsAction } from "./actions";

export default async function AdminLessonsPage({ searchParams }: { searchParams: { scale?: string } }) {
  const activeSlug = SCALE_GROUPS.find((s) => s.slug === searchParams.scale)?.slug ?? SCALE_GROUPS[0].slug;
  const activeScale = SCALE_GROUPS.find((s) => s.slug === activeSlug)!;
  const [lessons, storageConfigured] = await Promise.all([getLessonsForScale(activeSlug), Promise.resolve(isObjectStorageConfigured())]);

  return (
    <div>
      <p className="text-small font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50)/0.8)]">Admin</p>
      <h1 className="font-hero text-hero font-bold text-balance mt-1.5 text-slate-50">Lessons</h1>
      <p className="mt-2 text-small text-slate-500">Upload the video/PDF course content that drives each scale&apos;s course player.</p>

      {!storageConfigured && (
        <div className="mt-6 rounded-xl border border-[rgb(var(--c-s-50)/0.3)] bg-[rgb(var(--c-s-50)/0.05)] px-4 py-3 text-small text-[rgb(var(--c-s-50))]">
          Object storage isn&apos;t configured yet — set the <code className="font-mono text-small">R2_*</code> env vars (see{" "}
          <code className="font-mono text-small">.env.example</code>) before uploading. The list and reorder/delete controls below
          still work for anything already uploaded.
        </div>
      )}

      <div className="mt-6 flex w-fit flex-wrap gap-1.5 rounded-full p-1 bg-neu-base shadow-pressed-low">
        {SCALE_GROUPS.map((scale) => (
          <Link
            key={scale.slug}
            href={`/admin/lessons?scale=${scale.slug}`}
            className={`rounded-full px-3 py-1.5 text-small font-medium transition ${
              activeSlug === scale.slug ? "bg-[rgb(var(--signal)/0.14)] text-signal" : "text-slate-400 hover:text-slate-100"
            }`}
          >
            {scale.code}
          </Link>
        ))}
      </div>

      <div className="mt-6">
        <AdminLessonManager
          key={activeSlug}
          scaleGroupSlug={activeScale.slug}
          scaleGroupLabel={`${activeScale.code} — ${activeScale.title}`}
          lessons={lessons}
          storageConfigured={storageConfigured}
          onRequestUploadUrl={requestLessonUploadUrlAction}
          onCreateLesson={createLessonAction}
          onDeleteLesson={deleteLessonAction}
          onReorder={reorderLessonsAction}
        />
      </div>
    </div>
  );
}
