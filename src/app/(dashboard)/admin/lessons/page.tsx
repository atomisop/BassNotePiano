import { AdminFilterTabs } from "@/components/admin/AdminFilterTabs";
import { SCALE_GROUPS } from "@/lib/curriculum";
import { getLessonsForScale } from "@/lib/courseContent";
import { isObjectStorageConfigured } from "@/lib/storage";
import { AdminLessonManager } from "@/components/admin/AdminLessonManager";
import { requestLessonUploadUrlAction, createLessonAction, deleteLessonAction, reorderLessonsAction } from "./actions";

export const metadata = { title: "Admin: Lessons" };

export default async function AdminLessonsPage(props: { searchParams: Promise<{ scale?: string }> }) {
  const searchParams = await props.searchParams;
  const activeSlug = SCALE_GROUPS.find((s) => s.slug === searchParams.scale)?.slug ?? SCALE_GROUPS[0].slug;
  const activeScale = SCALE_GROUPS.find((s) => s.slug === activeSlug)!;
  const [lessons, storageConfigured] = await Promise.all([
    getLessonsForScale(activeSlug),
    Promise.resolve(isObjectStorageConfigured()),
  ]);

  return (
    <div>
      <div data-deck-header className="deck-header -mt-4 pt-4">
      <p className="text-small font-medium uppercase tracking-caps text-slate-50/80">Admin</p>
        <h1 className="font-hero text-hero font-bold text-balance mt-1.5 text-slate-50">Lessons</h1>
      </div>

      {!storageConfigured && (
        <div className="mt-6 rounded-xl border border-slate-50/30 bg-neu-base shadow-pressed-low px-4 py-3 text-small text-slate-50">
          Object storage isn&apos;t configured. Set the <code className="font-mono text-small">R2_*</code> env vars
          before uploading.
        </div>
      )}

      <div className="mt-6">
        <AdminFilterTabs
          label="Scale"
          mobile="select"
          desktop="select"
          items={SCALE_GROUPS.map((scale) => ({
            label: scale.code,
            selectLabel: `${scale.code} · ${scale.title}`,
            href: `/admin/lessons?scale=${scale.slug}`,
            active: activeSlug === scale.slug,
          }))}
        />
      </div>

      <div className="mt-6">
        <AdminLessonManager
          key={activeSlug}
          scaleGroupSlug={activeScale.slug}
          scaleGroupLabel={`${activeScale.code} · ${activeScale.title}`}
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
