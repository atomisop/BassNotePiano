// Admin-authored course content (video/PDF lessons) for the course player at
// /scales/[scaleSlug]. Deliberately a separate module from src/lib/lessons.ts
// — that one is the live 1:1 lesson *booking* system (LessonType ONLINE/
// IN_PERSON, credits, LessonBooking). This module is pre-recorded content a
// student watches/reads inside a scale's course player. Different feature,
// same word — kept in different files so the two are never confused at the
// import site.

import type { LessonMediaType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { deleteObject, keyFromPublicUrl } from "@/lib/storage";

export interface CourseLesson {
  id: string;
  scaleGroupId: string;
  order: number;
  title: string;
  description: string | null;
  type: LessonMediaType;
  fileUrl: string;
  fileName: string;
  fileSizeBytes: number | null;
  durationSeconds: number | null;
  createdAt: Date;
}

// BigInt doesn't cross the server/client component boundary cleanly — file
// sizes here are nowhere near Number.MAX_SAFE_INTEGER (~9 petabytes), so a
// plain number is both safe and simpler for every UI consumer.
function toCourseLesson(row: {
  id: string;
  scaleGroupId: string;
  order: number;
  title: string;
  description: string | null;
  type: LessonMediaType;
  fileUrl: string;
  fileName: string;
  fileSizeBytes: bigint | null;
  durationSeconds: number | null;
  createdAt: Date;
}): CourseLesson {
  return { ...row, fileSizeBytes: row.fileSizeBytes == null ? null : Number(row.fileSizeBytes) };
}

/** Every lesson for a scale group, in order — no per-user data, used by the admin list. */
export async function getLessonsForScale(scaleGroupSlug: string): Promise<CourseLesson[]> {
  const rows = await prisma.lesson.findMany({
    where: { scaleGroup: { slug: scaleGroupSlug } },
    orderBy: { order: "asc" },
  });
  return rows.map(toCourseLesson);
}

export interface CourseLessonWithProgress extends CourseLesson {
  completed: boolean;
}

/** Same list, joined with the given user's completion state — what the course player renders. */
export async function getLessonsWithProgress(scaleGroupSlug: string, userId: string): Promise<CourseLessonWithProgress[]> {
  const rows = await prisma.lesson.findMany({
    where: { scaleGroup: { slug: scaleGroupSlug } },
    orderBy: { order: "asc" },
    include: { progress: { where: { userId }, select: { completedAt: true } } },
  });
  return rows.map((row) => ({ ...toCourseLesson(row), completed: row.progress.some((p) => p.completedAt != null) }));
}

export interface CreateLessonInput {
  scaleGroupSlug: string;
  title: string;
  description?: string;
  type: LessonMediaType;
  fileUrl: string;
  fileName: string;
  fileSizeBytes?: number;
  durationSeconds?: number;
  uploadedById: string;
}

/** New lesson goes at the end of the current order for its scale group. */
export async function createLesson(input: CreateLessonInput): Promise<CourseLesson> {
  const scaleGroup = await prisma.scaleGroup.findUniqueOrThrow({ where: { slug: input.scaleGroupSlug } });
  const last = await prisma.lesson.findFirst({ where: { scaleGroupId: scaleGroup.id }, orderBy: { order: "desc" } });
  const nextOrder = (last?.order ?? -1) + 1;

  const row = await prisma.lesson.create({
    data: {
      scaleGroupId: scaleGroup.id,
      order: nextOrder,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      type: input.type,
      fileUrl: input.fileUrl,
      fileName: input.fileName,
      fileSizeBytes: input.fileSizeBytes != null ? BigInt(Math.round(input.fileSizeBytes)) : null,
      durationSeconds: input.durationSeconds ?? null,
      uploadedById: input.uploadedById,
    },
  });
  return toCourseLesson(row);
}

/** Deletes the DB row and best-effort cleans up the backing file in object storage. */
export async function deleteLesson(lessonId: string): Promise<void> {
  const lesson = await prisma.lesson.delete({ where: { id: lessonId } });
  const key = keyFromPublicUrl(lesson.fileUrl);
  if (key) await deleteObject(key);
}

/**
 * Re-sequences every lesson for a scale group to match `orderedLessonIds`.
 * Two-pass (temp negative orders, then final) inside one transaction so the
 * @@unique([scaleGroupId, order]) constraint never sees a transient
 * collision mid-reorder (e.g. swapping positions 0 and 1 directly would
 * otherwise hit the constraint on the first UPDATE).
 */
export async function reorderLessons(scaleGroupSlug: string, orderedLessonIds: string[]): Promise<void> {
  const scaleGroup = await prisma.scaleGroup.findUniqueOrThrow({ where: { slug: scaleGroupSlug } });

  await prisma.$transaction([
    ...orderedLessonIds.map((id, index) =>
      prisma.lesson.updateMany({ where: { id, scaleGroupId: scaleGroup.id }, data: { order: -(index + 1) } }),
    ),
    ...orderedLessonIds.map((id, index) =>
      prisma.lesson.updateMany({ where: { id, scaleGroupId: scaleGroup.id }, data: { order: index } }),
    ),
  ]);
}

/** Marks one lesson complete for a user — idempotent, safe to call repeatedly (e.g. re-watching a finished video). */
export async function markLessonComplete(userId: string, lessonId: string): Promise<void> {
  await prisma.lessonProgress.upsert({
    where: { userId_lessonId: { userId, lessonId } },
    update: { completedAt: new Date() },
    create: { userId, lessonId, completedAt: new Date() },
  });
}

export interface LessonCompletionSummary {
  hasContent: boolean;
  allComplete: boolean;
  completedCount: number;
  totalCount: number;
}

/**
 * Whether a user has finished every uploaded lesson for a scale group.
 * `hasContent: false` (zero lessons uploaded yet) never counts as "all
 * complete" — vacuous completion would silently tick the checklist for
 * content that doesn't exist yet.
 */
export async function getLessonCompletionSummary(userId: string, scaleGroupSlug: string): Promise<LessonCompletionSummary> {
  const lessons = await prisma.lesson.findMany({
    where: { scaleGroup: { slug: scaleGroupSlug } },
    select: { id: true, progress: { where: { userId }, select: { completedAt: true } } },
  });
  const totalCount = lessons.length;
  const completedCount = lessons.filter((l) => l.progress.some((p) => p.completedAt != null)).length;
  return { hasContent: totalCount > 0, allComplete: totalCount > 0 && completedCount === totalCount, completedCount, totalCount };
}
