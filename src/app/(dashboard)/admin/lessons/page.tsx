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
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50)/0.8)]">Admin</p>
      <h1 className="mt-1.5 font-serif text-3xl text-slate-50">Lessons</h1>
      <p className="mt-2 text-sm text-slate-500">Upload the video/PDF course content that drives each scale&apos;s course player.</p>

      {!storageConfigured && (
        <div className="mt-6 rounded-xl border border-[rgb(var(--c-s-50)/0.3)] bg-[rgb(var(--c-s-50)/0.05)] px-4 py-3 text-sm text-[rgb(var(--c-s-50))]">
          Object storage isn&apos;t configured yet — set the <code className="font-mono text-xs">R2_*</code> env vars (see{" "}
          <code className="font-mono text-xs">.env.example</code>) before uploading. The list and reorder/delete controls below
          still work for anything already uploaded.
        </div>
      )}

      <div className="mt-6 flex w-fit flex-wrap gap-1.5 rounded-full border border-ink/10 p-1">
        {SCALE_GROUPS.map((scale) => (
          <Link
            key={scale.slug}
            href={`/admin/lessons?scale=${scale.slug}`}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
              activeSlug === scale.slug ? "bg-amber-400 text-slate-950" : "text-slate-400 hover:text-slate-100"
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
