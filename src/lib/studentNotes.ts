import { prisma } from "@/lib/prisma";

export const MAX_NOTE_LENGTH = 5000;

export interface StudentNoteRow {
  id: string;
  body: string;
  hiddenFromStudent: boolean;
  createdAt: string;
  updatedAt: string;
}

function toRow(n: { id: string; body: string; hiddenFromStudent: boolean; createdAt: Date; updatedAt: Date }): StudentNoteRow {
  return { id: n.id, body: n.body, hiddenFromStudent: n.hiddenFromStudent, createdAt: n.createdAt.toISOString(), updatedAt: n.updatedAt.toISOString() };
}

/** Every note on a student, newest first, for the teacher. Includes the private ones. */
export async function listNotesForTeacher(studentId: string): Promise<StudentNoteRow[]> {
  const notes = await prisma.studentNote.findMany({ where: { studentId }, orderBy: { createdAt: "desc" } });
  return notes.map(toRow);
}

/** Only the notes the teacher left visible, for the student's own page. Private notes never leave the server. */
export async function listNotesForStudent(studentId: string): Promise<Pick<StudentNoteRow, "id" | "body" | "updatedAt">[]> {
  const notes = await prisma.studentNote.findMany({
    where: { studentId, hiddenFromStudent: false },
    orderBy: { updatedAt: "desc" },
    select: { id: true, body: true, updatedAt: true },
  });
  return notes.map((n) => ({ id: n.id, body: n.body, updatedAt: n.updatedAt.toISOString() }));
}

function cleanBody(body: string): string {
  const trimmed = body.trim();
  if (!trimmed) throw new Error("Write something first.");
  if (trimmed.length > MAX_NOTE_LENGTH) throw new Error(`Notes can be ${MAX_NOTE_LENGTH} characters at most.`);
  return trimmed;
}

export async function createNote(studentId: string, authorId: string, body: string, hiddenFromStudent: boolean): Promise<StudentNoteRow> {
  const student = await prisma.user.findUnique({ where: { id: studentId }, select: { id: true } });
  if (!student) throw new Error("That student no longer exists.");
  return toRow(await prisma.studentNote.create({ data: { studentId, authorId, body: cleanBody(body), hiddenFromStudent } }));
}

export async function updateNote(noteId: string, body: string, hiddenFromStudent: boolean): Promise<StudentNoteRow> {
  return toRow(await prisma.studentNote.update({ where: { id: noteId }, data: { body: cleanBody(body), hiddenFromStudent } }));
}

export async function deleteNote(noteId: string): Promise<void> {
  await prisma.studentNote.deleteMany({ where: { id: noteId } });
}

export interface NotesRosterRow {
  studentId: string;
  name: string | null;
  email: string;
  times: string[];
  noteCount: number;
}

/** The distinct students booked into a window, with when and how many notes they already have. */
export async function getStudentsBookedBetween(start: Date, end: Date): Promise<NotesRosterRow[]> {
  const bookings = await prisma.classBooking.findMany({
    where: { status: { in: ["SCHEDULED", "COMPLETED"] }, scheduledAt: { gte: start, lt: end } },
    select: { scheduledAt: true, student: { select: { id: true, name: true, email: true, _count: { select: { teacherNotes: true } } } } },
    orderBy: { scheduledAt: "asc" },
  });
  const byStudent = new Map<string, NotesRosterRow>();
  for (const b of bookings) {
    const row = byStudent.get(b.student.id) ?? { studentId: b.student.id, name: b.student.name, email: b.student.email, times: [], noteCount: b.student._count.teacherNotes };
    row.times.push(b.scheduledAt.toISOString());
    byStudent.set(b.student.id, row);
  }
  return Array.from(byStudent.values());
}
