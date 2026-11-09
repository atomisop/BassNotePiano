import Link from "next/link";
import { AdminFilterTabs } from "@/components/admin/AdminFilterTabs";
import { getLessonsForScale } from "@/lib/courseContent";
import { listScalesForLessons } from "@/lib/roadmaps";
import { lessonScaleLabel, pickLessonScale } from "@/lib/lessonScales";
import { isObjectStorageConfigured } from "@/lib/storage";
import { AdminLessonManager } from "@/components/admin/AdminLessonManager";
import { requestLessonUploadUrlAction, createLessonAction, deleteLessonAction, reorderLessonsAction, updateLessonTextAction } from "./actions";

export const metadata = { title: "Admin: Lessons" };

export default async function AdminLessonsPage(props: { searchParams: Promise<{ scale?: string }> }) {
  const searchParams = await props.searchParams;
  // The scales come from the database, so one added on Setup > Roadmaps is here at once and can get its lessons.
  const scales = await listScalesForLessons();
  const activeScale = pickLessonScale(scales, searchParams.scale);
  const manyRoadmaps = new Set(scales.map((s) => s.roadmapName)).size > 1;
  const [lessons, storageConfigured] = await Promise.all([
    activeScale ? getLessonsForScale(activeScale.slug) : Promise.resolve([]),
    Promise.resolve(isObjectStorageConfigured()),
  ]);

  return (
    <div>
      <h1 className="sr-only">Lessons</h1>

      {!storageConfigured && (
        <div className="mt-6 rounded-xl border border-slate-50/30 bg-neu-base shadow-pressed-low px-4 py-3 text-small text-slate-50">
          Object storage isn&apos;t configured. Set the <code className="font-mono text-small">R2_*</code> env vars
          before uploading.
        </div>
      )}

      {!activeScale ? (
        <p className="mt-6 text-small text-slate-400">
          No scales yet. Add one on{" "}
          <Link href="/admin/roadmaps" className="tap inline-flex items-center underline underline-offset-4">
            Roadmaps
          </Link>
          , then add its lessons here.
        </p>
      ) : (
        <>
          <div className="mt-6">
            <AdminFilterTabs
              label="Scale"
              mobile="select"
              desktop="select"
              items={scales.map((scale) => ({
                label: scale.code,
                selectLabel: lessonScaleLabel(scale, manyRoadmaps),
                href: `/admin/lessons?scale=${scale.slug}`,
                active: activeScale.slug === scale.slug,
              }))}
            />
          </div>

          <div className="mt-6">
            <AdminLessonManager
              key={activeScale.slug}
              scaleGroupSlug={activeScale.slug}
              scaleGroupLabel={`${activeScale.code} · ${activeScale.title}`}
              lessons={lessons}
              storageConfigured={storageConfigured}
              onRequestUploadUrl={requestLessonUploadUrlAction}
              onCreateLesson={createLessonAction}
              onDeleteLesson={deleteLessonAction}
              onReorder={reorderLessonsAction}
              onEditLesson={updateLessonTextAction}
            />
          </div>
        </>
      )}
    </div>
  );
}
