"use server";

import { revalidatePath } from "next/cache";
import { getServerAuthSession } from "@/lib/auth";
import { todayBoundsEt } from "@/lib/classSchedule";
import { searchStudentsForBooking, type BookableStudent } from "@/lib/admin";
import {
  createNote,
  deleteNote,
  getStudentsBookedBetween,
  listNotesForTeacher,
  updateNote,
  type NotesRosterRow,
  type StudentNoteRow,
} from "@/lib/studentNotes";

async function requireAdminId(): Promise<string> {
  const session = await getServerAuthSession();
  if (!session?.user || session.user.role !== "ADMIN") throw new Error("Not allowed.");
  return session.user.id;
}

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

function fail(err: unknown): { ok: false; error: string } {
  return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
}

/** The students with a class today (US Eastern time), for the Student Notes panel. */
export async function getTodaysNotesRosterAction(): Promise<NotesRosterRow[]> {
  await requireAdminId();
  const { start, end } = todayBoundsEt();
  return getStudentsBookedBetween(start, end);
}

export async function searchStudentsForNotesAction(query: string): Promise<BookableStudent[]> {
  await requireAdminId();
  return searchStudentsForBooking(query);
}

export async function listStudentNotesAction(studentId: string): Promise<Result<{ notes: StudentNoteRow[] }>> {
  try {
    await requireAdminId();
    return { ok: true, notes: await listNotesForTeacher(studentId) };
  } catch (err) {
    return fail(err);
  }
}

export async function saveStudentNoteAction(
  studentId: string,
  noteId: string | null,
  body: string,
  hiddenFromStudent: boolean,
): Promise<Result<{ note: StudentNoteRow }>> {
  try {
    const adminId = await requireAdminId();
    const note = noteId ? await updateNote(noteId, body, hiddenFromStudent) : await createNote(studentId, adminId, body, hiddenFromStudent);
    revalidatePath("/dashboard");
    return { ok: true, note };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteStudentNoteAction(noteId: string): Promise<Result<unknown>> {
  try {
    await requireAdminId();
    await deleteNote(noteId);
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}
