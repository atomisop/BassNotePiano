// Admin > Classes > Lessons picks a scale from the database, not from the fixed list in curriculum.ts, so a scale the owner adds on
// Setup > Roadmaps can get lessons straight away (createLesson, the list and the student player all find a scale by its slug).
// Pure, so it is tested without a database.

export interface LessonScaleOption {
  slug: string;
  code: string;
  title: string;
  roadmapName: string | null;
  /** Its roadmap is hidden from students: lessons can still be added before it is turned on. */
  roadmapHidden: boolean;
}

/** The scale asked for in `?scale=`, or the first one when it is missing or unknown. Null only when there are no scales at all. */
export function pickLessonScale<T extends { slug: string }>(scales: T[], requested: string | null | undefined): T | null {
  return scales.find((s) => s.slug === requested) ?? scales[0] ?? null;
}

/** The picker's text. With more than one roadmap the roadmap is named, since each one numbers its scales from 1. */
export function lessonScaleLabel(scale: LessonScaleOption, manyRoadmaps: boolean): string {
  const base = `${scale.code} · ${scale.title}`;
  const where = manyRoadmaps && scale.roadmapName ? `${scale.roadmapName} · ` : "";
  return `${where}${base}${scale.roadmapHidden ? " (hidden)" : ""}`;
}
