import Link from "next/link";
import { AdminFilterTabs } from "@/components/admin/AdminFilterTabs";
import { getLessonsForScale } from "@/lib/courseContent";
import { listScalesForLessons } from "@/lib/roadmaps";
import { lessonScaleLabel, pickLessonScale } from "@/lib/lessonScales";
import { isObjectStorageConfigured } from "@/lib/storage";
import { AdminLessonManager } from "@/components/admin/AdminLessonManager";
import { Callout } from "@/components/ui/CardKit";
import { requestLessonUploadUrlAction, createLessonAction, deleteLessonAction, reorderLessonsAction, updateLessonTextAction } from "./actions";

import { SectionPills } from "@/components/admin/SectionPills";
import { RoadmapsView } from "../roadmaps/_view";
import { DiscordView } from "../discord/_view";

export const metadata = { title: "Admin: Lessons" };

async function LessonsView(props: { searchParams: Promise<{ scale?: string }> }) {
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
        <Callout tone="warning" className="mt-3">
          Object storage isn&apos;t configured. Set the <code className="font-mono text-small">R2_*</code> env vars
          before uploading.
        </Callout>
      )}

      {!activeScale ? (
        <p className="mt-4 text-small text-slate-400">
          No scales yet. Add one on{" "}
          <Link href="/admin/roadmaps" className="tap inline-flex items-center underline underline-offset-4">
            Roadmaps
          </Link>
          , then add its lessons here.
        </p>
      ) : (
        <>
          <div className="mt-3">
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

          <div className="mt-4">
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

/** Lessons, Roadmaps and Discord are one page (2026-11-10): the roadmaps hold the scales the lessons belong to, and class calls are in Discord. */
export default async function AdminLessonsPage(props: { searchParams: Promise<{ scale?: string; section?: string }> }) {
  const sp = await props.searchParams;
  const section = sp.section === "roadmaps" ? "roadmaps" : sp.section === "discord" ? "discord" : null;
  return (
    <div>
      <SectionPills base="/admin/lessons" label="Lesson views" active={section} items={[{ label: "Lessons", value: null }, { label: "Roadmaps", value: "roadmaps" }, { label: "Discord", value: "discord" }]} />
      {section === "roadmaps" ? <RoadmapsView /> : section === "discord" ? <DiscordView /> : <LessonsView searchParams={Promise.resolve(sp)} />}
    </div>
  );
}
