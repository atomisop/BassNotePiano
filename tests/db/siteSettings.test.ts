import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerAuthSession: async () => null, authOptions: {} }));
import { bookClass, cancelClassBooking, nextOccurrenceDates, ClassBookingError } from "@/lib/classSchedule";
import { getBoolSetting, getNumberSetting, resetSetting, saveSetting } from "@/lib/siteSettings";
import { createNote, listNotesForStudent, listNotesForTeacher, updateNote } from "@/lib/studentNotes";
import { makeUser, newTag, prisma } from "./helpers";

const tag = newTag("st");
let teacher: { id: string }, student: { id: string }, slot: { id: string };

beforeAll(async () => {
  teacher = await makeUser(tag, "Teacher", { role: "ADMIN" });
  student = await makeUser(tag, "Student One", { classCredits: 100 });
  // A slot on tomorrow's weekday: always well inside a 168 hour notice window.
  const tomorrowDay = (new Date().getUTCDay() + 1) % 7;
  slot = await prisma.classSchedule.create({ data: { dayOfWeek: tomorrowDay, startTime: "10:00", durationMin: 45, creditCost: 2, label: `${tag} slot` } });
});
afterAll(async () => {
  for (const key of ["booking.paused", "booking.minNoticeHours", "cancel.studentCanCancel"]) await resetSetting(key);
  await prisma.studentNote.deleteMany({ where: { studentId: student.id } });
  await prisma.notification.deleteMany({ where: { userId: { in: [teacher.id, student.id] } } });
  await prisma.classBooking.deleteMany({ where: { studentId: student.id } });
  await prisma.classSchedule.deleteMany({ where: { id: slot.id } });
  await prisma.user.deleteMany({ where: { id: { in: [teacher.id, student.id] } } });
});

describe("settings the booking code reads", () => {
  it("reads defaults, then a saved value, then the default again after a reset", async () => {
    expect(await getBoolSetting("booking.allowSameDay")).toBe(true);
    await saveSetting("booking.minNoticeHours", 12);
    expect(await getNumberSetting("booking.minNoticeHours")).toBe(12);
    await resetSetting("booking.minNoticeHours");
    expect(await getNumberSetting("booking.minNoticeHours")).toBe(0);
  });

  it("refuses a booking while bookings are paused, and an admin booking for the student still works", async () => {
    const date = nextOccurrenceDates(slotDay(), 2)[1];
    await saveSetting("booking.paused", true);
    await expect(bookClass(student.id, slot.id, date.getTime(), 0, 2)).rejects.toThrow(/paused/i);
    await bookClass(student.id, slot.id, date.getTime(), 0, 2, { isAdminAssisted: true });
    await resetSetting("booking.paused");
    await prisma.classBooking.deleteMany({ where: { studentId: student.id } });
  });

  it("enforces the minimum notice", async () => {
    const date = nextOccurrenceDates(slotDay(), 2)[0];
    await saveSetting("booking.minNoticeHours", 168);
    await expect(bookClass(student.id, slot.id, date.getTime(), 0, 2)).rejects.toThrow(/at least 168 hours ahead/);
    await resetSetting("booking.minNoticeHours");
  });

  it("stops a student cancelling when self-cancel is off", async () => {
    const date = nextOccurrenceDates(slotDay(), 3)[2];
    const booking = await bookClass(student.id, slot.id, date.getTime(), 0, 2);
    await saveSetting("cancel.studentCanCancel", false);
    await expect(cancelClassBooking(booking.id, student.id)).rejects.toBeInstanceOf(ClassBookingError);
    await resetSetting("cancel.studentCanCancel");
    await cancelClassBooking(booking.id, student.id);
  });
});

function slotDay() {
  return (new Date().getUTCDay() + 1) % 7;
}

describe("student notes", () => {
  it("shows the student only the notes that are not hidden, and lets the teacher edit one", async () => {
    const shown = await createNote(student.id, teacher.id, "Great scale work this week", false);
    const secret = await createNote(student.id, teacher.id, "Seems distracted, check in", true);

    const asTeacher = await listNotesForTeacher(student.id);
    expect(asTeacher.map((n) => n.body).sort()).toEqual(["Great scale work this week", "Seems distracted, check in"]);

    const asStudent = await listNotesForStudent(student.id);
    expect(asStudent.map((n) => n.body)).toEqual(["Great scale work this week"]);
    expect(JSON.stringify(asStudent)).not.toContain("distracted");

    await updateNote(secret.id, "Seems distracted, check in", false);
    expect((await listNotesForStudent(student.id)).length).toBe(2);
    await updateNote(shown.id, "Great scale work, now on Scale 3", true);
    expect((await listNotesForStudent(student.id)).map((n) => n.body)).toEqual(["Seems distracted, check in"]);
  });

  it("refuses an empty note", async () => {
    await expect(createNote(student.id, teacher.id, "   ", false)).rejects.toThrow();
  });
});
