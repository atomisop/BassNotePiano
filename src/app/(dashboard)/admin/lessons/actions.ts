"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { LessonMediaType } from "@prisma/client";
import { getServerAuthSession } from "@/lib/auth";
import { createPresignedLessonUpload, isAcceptableLessonFileRef } from "@/lib/storage";
import { createLesson, deleteLesson, reorderLessons, updateLessonText, LessonEditError, type CreateLessonInput } from "@/lib/courseContent";
import { logAudit } from "@/lib/audit";

// The admin layout's redirect only protects rendering, Server Actions are
// separate RPC endpoints the layout never runs for, so this is the actual
// authorization check for these mutations, not just a UX nicety. Same
// pattern as every other admin action in this codebase (e.g.
// admin/bookings/actions.ts).
async function requireAdmin() {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/admin/lessons");
  if (session.user.role !== "ADMIN") redirect("/dashboard");
  return session.user;
}

export async function requestLessonUploadUrlAction(
  scaleGroupSlug: string,
  fileName: string,
  contentType: string,
  fileSize: number,
) {
  await requireAdmin();
  return createPresignedLessonUpload(scaleGroupSlug, fileName, contentType, fileSize);
}

export interface CreateLessonActionInput {
  scaleGroupSlug: string;
  title: string;
  description?: string;
  type: LessonMediaType;
  fileUrl: string;
  fileName: string;
  fileSizeBytes?: number;
  durationSeconds?: number;
}

export async function createLessonAction(input: CreateLessonActionInput) {
  const admin = await requireAdmin();
  if (!isAcceptableLessonFileRef(input.fileUrl)) throw new Error("That file address is not an uploaded lesson file.");
  const payload: CreateLessonInput = { ...input, uploadedById: admin.id };
  const lesson = await createLesson(payload);
  revalidatePath("/admin/lessons");
  revalidatePath(`/scales/${input.scaleGroupSlug}`);
  return lesson;
}

export async function deleteLessonAction(lessonId: string, scaleGroupSlug: string) {
  await requireAdmin();
  await deleteLesson(lessonId);
  revalidatePath("/admin/lessons");
  revalidatePath(`/scales/${scaleGroupSlug}`);
}

export async function reorderLessonsAction(scaleGroupSlug: string, orderedLessonIds: string[]) {
  await requireAdmin();
  await reorderLessons(scaleGroupSlug, orderedLessonIds);
  revalidatePath("/admin/lessons");
  revalidatePath(`/scales/${scaleGroupSlug}`);
}

export async function updateLessonTextAction(lessonId: string, scaleGroupSlug: string, title: string, description: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = await requireAdmin();
  try {
    const lesson = await updateLessonText(lessonId, title, description);
    await logAudit({ actorId: admin.id, action: "lesson.edit", targetType: "Lesson", targetId: lessonId, detail: `Lesson renamed to "${lesson.title}"` }).catch(() => undefined);
  } catch (err) {
    return { ok: false, error: err instanceof LessonEditError ? err.message : "Could not save the lesson. Try again." };
  }
  revalidatePath("/admin/lessons");
  revalidatePath(`/scales/${scaleGroupSlug}`);
  return { ok: true };
}
