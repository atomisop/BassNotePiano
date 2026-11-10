import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
// The actions read the signed-in admin from here; the library functions are called with the actor directly.
vi.mock("@/lib/auth", () => ({
  getServerAuthSession: async () => (globalThis as { __abSession?: unknown }).__abSession ?? null,
  getServerSession: async () => null,
  authOptions: {},
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
import { bookClass, getUpcomingOccurrences, nextOccurrenceDates, ONE_OFF_LABEL } from "@/lib/classSchedule";
import { createOwnerReservation, listOwnerReservations } from "@/lib/ownerReservationsAdmin";
import { adminBookForStudent, bookReservedHour } from "@/lib/adminBooking";
import { OWNER_EMAIL } from "@/lib/adminNotifications";
import { OFFERED_PLAN_CADENCE } from "@/lib/classCreditPricing";
import { makeUser, newTag, prisma } from "./helpers";

// The studio books anyone at any time from where it is: typed times made on the spot, walk-ins recorded as taught, a plan's
// time after a yes, a missing credit added in the same step, a customer's own reserved time, and days it does not usually teach.
const tag = newTag("ab");
const iso = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => {
  const t = new Date(Date.now() - n * 86_400_000);
  return iso(new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate())));
};
type U = { id: string; email: string; name: string | null };
let owner: U, staff: U, typed: U, walkIn: U, broke: U, planner: U, holder: U, customer: U, unverified: U, stranger: U;
let sched: { id: string };
let offDay = 6;
const tuesdays = nextOccurrenceDates(2, 8).slice(1);
const ownerActor = () => ({ id: owner.id, email: OWNER_EMAIL });
const staffActor = () => ({ id: staff.id, email: staff.email });
const everyone = () => [typed, walkIn, broke, planner, holder, customer, unverified, stranger].map((u) => u.id);
const contact = (email: string) => ({ name: "Pat Customer", email, phone: "(212) 555-0134" });
const extraSchedules: string[] = [];

beforeAll(async () => {
  owner = await makeUser(tag, "Owner", { role: "ADMIN" });
  staff = await makeUser(tag, "Staff", { role: "ADMIN" });
  typed = await makeUser(tag, "Tia Typed", { classCredits: 20 });
  walkIn = await makeUser(tag, "Walt Walkin", { classCredits: 10 });
  broke = await makeUser(tag, "Broke Student", { classCredits: 0 });
  planner = await makeUser(tag, "Pia Planner", { classCredits: 20 });
  holder = await makeUser(tag, "Hal Holder", { classCredits: 20 });
  customer = await makeUser(tag, "Cara Customer", { classCredits: 20, emailVerified: new Date() });
  unverified = await makeUser(tag, "Una Verified", { classCredits: 20, emailVerified: null });
  stranger = await makeUser(tag, "Stan Stranger", { classCredits: 20, emailVerified: new Date() });
  sched = await prisma.classSchedule.create({ data: { dayOfWeek: 2, startTime: "09:00", durationMin: 120, creditCost: 4, label: `${tag} tue` } });
  // A weekday the studio does not teach in this database.
  for (const d of [6, 0, 5, 4, 3, 1]) {
    if ((await prisma.classSchedule.count({ where: { active: true, dayOfWeek: d } })) === 0) {
      offDay = d;
      break;
    }
  }
  (globalThis as { __abSession?: unknown }).__abSession = { user: { id: owner.id, role: "ADMIN", email: OWNER_EMAIL } };
});

afterAll(async () => {
  const ids = everyone();
  await prisma.classBooking.deleteMany({ where: { studentId: { in: ids } } });
  await prisma.bookingRequest.deleteMany({ where: { studentId: { in: ids } } });
  await prisma.ownerReservation.deleteMany({ where: { createdById: owner.id } });
  await prisma.slotHold.deleteMany({ where: { scheduleId: sched.id } });
  await prisma.contact.deleteMany({ where: { name: { startsWith: tag } } });
  await prisma.creditAdjustment.deleteMany({ where: { userId: { in: ids } } });
  await prisma.creditGrant.deleteMany({ where: { userId: { in: ids } } });
  await prisma.notification.deleteMany({ where: { userId: { in: [...ids, owner.id, staff.id] } } });
  await prisma.auditLog.deleteMany({ where: { actorId: { in: [owner.id, staff.id] } } });
  await prisma.idempotencyKey.deleteMany({ where: { userId: { in: [owner.id, staff.id] } } });
  await prisma.paymentPlan.deleteMany({ where: { userId: { in: ids } } });
  await prisma.classSchedule.deleteMany({ where: { id: { in: [sched.id, ...extraSchedules] } } });
  await prisma.classSchedule.deleteMany({ where: { label: ONE_OFF_LABEL, active: false, bookings: { none: {} }, ownerReservations: { none: {} }, bookingRequests: { none: {} } } });
  await prisma.user.deleteMany({ where: { id: { in: [...ids, owner.id, staff.id] } } });
  delete (globalThis as { __abSession?: unknown }).__abSession;
});

const offDays = () => nextOccurrenceDates(offDay, 8).slice(1).map(iso);
const credits = async (id: string) => (await prisma.user.findUniqueOrThrow({ where: { id }, select: { classCredits: true } })).classCredits;

describe("Book a class at any day and typed time", () => {
  it("makes the time on the spot, tells the student, and refuses another class that overlaps it", async () => {
    const day = offDays()[0];
    const made = await adminBookForStudent(ownerActor(), typed.id, { date: day, time: "11:00" });
    expect(made).toMatchObject({ ok: true, walkIn: false, creditsAdded: 0 });
    const booking = await prisma.classBooking.findUniqueOrThrow({ where: { id: (made as { bookingId: string }).bookingId }, include: { schedule: true } });
    expect(booking).toMatchObject({ status: "SCHEDULED", studentId: typed.id });
    expect(booking.schedule).toMatchObject({ label: ONE_OFF_LABEL, active: false, dayOfWeek: offDay });
    expect(await prisma.notification.findFirst({ where: { userId: typed.id, title: "The studio booked a class for you" } })).toBeTruthy();
    expect(await prisma.auditLog.findFirst({ where: { actorId: owner.id, action: "booking.book-custom", targetId: typed.id } })).toBeTruthy();

    const clash = await adminBookForStudent(ownerActor(), stranger.id, { date: day, time: "11:30" });
    expect(clash).toMatchObject({ ok: false });
    expect((clash as { error: string }).error).toMatch(/overlaps a class/);
    // Back to back is fine.
    expect(await adminBookForStudent(ownerActor(), stranger.id, { date: day, time: "11:45" })).toMatchObject({ ok: true });
  });

  it("a past time records a walk-in: booked and marked Present, the credit used once, nothing announced", async () => {
    const before = await credits(walkIn.id);
    const day = daysAgo(3);
    const r = await adminBookForStudent(ownerActor(), walkIn.id, { date: day, time: "16:00" });
    expect(r).toMatchObject({ ok: true, walkIn: true });
    const booking = await prisma.classBooking.findUniqueOrThrow({ where: { id: (r as { bookingId: string }).bookingId } });
    expect(booking).toMatchObject({ status: "COMPLETED", attendance: "PRESENT" });
    expect(await credits(walkIn.id)).toBe(before - 2);
    expect(await prisma.notification.count({ where: { userId: walkIn.id, title: "The studio booked a class for you" } })).toBe(0);
    expect(await prisma.auditLog.findFirst({ where: { actorId: owner.id, action: "booking.walk-in", targetId: walkIn.id } })).toBeTruthy();

    const again = await adminBookForStudent(ownerActor(), walkIn.id, { date: day, time: "16:20" });
    expect((again as { error: string }).error).toMatch(/already have a class marked/);
    expect(await credits(walkIn.id)).toBe(before - 2);
  });
});

describe("no free credit", () => {
  const slot = () => ({ scheduleId: sched.id, occurrenceDateMs: tuesdays[1].getTime(), chunkIndex: 1 });

  it("names the student; staff cannot add a credit, the owner adds one and books in one step", async () => {
    const staffTry = await adminBookForStudent(staffActor(), broke.id, slot());
    expect(staffTry).toMatchObject({ ok: false, shortBy: 2, canAddCredit: false });
    expect((staffTry as { error: string }).error).toBe("Broke has no free credit, and this class needs 1 credit. Only the owner can add credits.");
    expect(await adminBookForStudent(staffActor(), broke.id, slot(), { addCredit: true })).toMatchObject({ ok: false, error: "Only the owner can add credits." });
    expect(await credits(broke.id)).toBe(0);

    expect(await adminBookForStudent(ownerActor(), broke.id, slot())).toMatchObject({ ok: false, canAddCredit: true });
    const done = await adminBookForStudent(ownerActor(), broke.id, slot(), { addCredit: true });
    expect(done).toMatchObject({ ok: true, creditsAdded: 2 });
    expect(await credits(broke.id)).toBe(2);
    expect(await prisma.creditAdjustment.count({ where: { userId: broke.id, amount: 2 } })).toBe(1);
    expect(await prisma.auditLog.findFirst({ where: { actorId: owner.id, action: "credits.grant", targetId: broke.id } })).toBeTruthy();
  });

  it("Schedule > Requests: the confirm names the student and the owner can add the credit and confirm there", async () => {
    const { confirmBookingRequestAction } = await import("@/app/(dashboard)/admin/schedule/actions");
    const empty = await makeUser(tag, "Rae Request", { classCredits: 0 });
    everyoneExtra.push(empty.id);
    const date = tuesdays[2];
    const request = await prisma.bookingRequest.create({
      data: { studentId: empty.id, scheduleId: sched.id, occurrenceDate: date, scheduledAt: new Date(date.getTime() + 14 * 3_600_000), chunkIndex: 0 },
    });
    // Line the stored start up with the real slot.
    const occ = (await getUpcomingOccurrences(undefined, { forAdmin: true })).find((o) => o.scheduleId === sched.id && o.occurrenceDate.getTime() === date.getTime() && o.chunkIndex === 0)!;
    await prisma.bookingRequest.update({ where: { id: request.id }, data: { scheduledAt: occ.scheduledAt } });

    const first = await confirmBookingRequestAction(request.id);
    expect(first).toMatchObject({ ok: false, canAddCredit: true, shortBy: 2 });
    expect((first as { error: string }).error).toMatch(/^Rae has no free credit/);
    expect(await confirmBookingRequestAction(request.id, { addCredit: true })).toEqual({ ok: true });
    expect(await prisma.bookingRequest.findUniqueOrThrow({ where: { id: request.id } })).toMatchObject({ status: "CONFIRMED" });
    expect(await prisma.classBooking.count({ where: { studentId: empty.id, status: "SCHEDULED" } })).toBe(1);
  });
});
const everyoneExtra: string[] = [];
afterAll(async () => {
  await prisma.classBooking.deleteMany({ where: { studentId: { in: everyoneExtra } } });
  await prisma.bookingRequest.deleteMany({ where: { studentId: { in: everyoneExtra } } });
  await prisma.creditAdjustment.deleteMany({ where: { userId: { in: everyoneExtra } } });
  await prisma.creditGrant.deleteMany({ where: { userId: { in: everyoneExtra } } });
  await prisma.notification.deleteMany({ where: { userId: { in: everyoneExtra } } });
  await prisma.user.deleteMany({ where: { id: { in: everyoneExtra } } });
});

describe("a weekly time another student's plan keeps", () => {
  it("is refused until the studio says yes, then booked and audited", async () => {
    await prisma.paymentPlan.create({
      data: { userId: holder.id, cadence: OFFERED_PLAN_CADENCE, term: "TERM_3", installmentAmountCents: 5500, creditsPerInstallment: 8, termMonths: 3, installmentsPaid: 1, nextDueDate: new Date(Date.now() + 25 * 86_400_000), reservedScheduleId: sched.id, reservedChunkIndex: 0 },
    });
    const slot = { scheduleId: sched.id, occurrenceDateMs: tuesdays[3].getTime(), chunkIndex: 0 };
    expect(await adminBookForStudent(ownerActor(), planner.id, slot)).toMatchObject({ ok: false, planHold: true });
    expect(await adminBookForStudent(ownerActor(), planner.id, slot, { overridePlanHold: true })).toMatchObject({ ok: true });
    expect(await prisma.auditLog.findFirst({ where: { actorId: owner.id, action: "booking.book-over-plan-hold", targetId: planner.id } })).toBeTruthy();
    await prisma.paymentPlan.deleteMany({ where: { userId: holder.id } });
  });
});

describe("a time the owner kept for this student", () => {
  it("is open to them in the studio's list, and is released when the studio books it; a whole window keeps its other hour", async () => {
    const date = tuesdays[4];
    const made = await createOwnerReservation(owner.id, { ...contact(customer.email), date: iso(date), hours: null });
    const find = (list: Awaited<ReturnType<typeof getUpcomingOccurrences>>, chunk: number) =>
      list.find((o) => o.scheduleId === sched.id && o.occurrenceDate.getTime() === date.getTime() && o.chunkIndex === chunk);
    expect(find(await getUpcomingOccurrences(customer.id, { forAdmin: true }), 0)).toMatchObject({ isBooked: false, reservedForYou: true });
    expect(find(await getUpcomingOccurrences(stranger.id, { forAdmin: true }), 0)).toMatchObject({ isBooked: true });

    expect(await adminBookForStudent(ownerActor(), customer.id, { scheduleId: sched.id, occurrenceDateMs: date.getTime(), chunkIndex: 0 })).toMatchObject({ ok: true });
    const rows = await prisma.ownerReservation.findMany({ where: { groupId: made.groupId } });
    expect(rows.find((r) => r.chunkIndex === null)?.releasedAt).toBeTruthy();
    expect(rows.filter((r) => r.releasedAt === null).map((r) => r.chunkIndex)).toEqual([1]);
    await expect(bookClass(stranger.id, sched.id, date.getTime(), 1)).rejects.toThrow(/reserved by the owner/);
    expect((await listOwnerReservations()).find((g) => g.groupId === made.groupId)).toMatchObject({ what: "10:00 AM", accountId: customer.id });
  });

  it("Book it books the customer's verified account into the kept hour and releases it; an unverified account is refused", async () => {
    const date = tuesdays[5];
    const mine = await createOwnerReservation(owner.id, { ...contact(customer.email), date: iso(date), hours: [{ scheduleId: sched.id, chunkIndex: 1 }] });
    const r = await bookReservedHour(ownerActor(), mine.groupId, sched.id, 1);
    expect(r).toMatchObject({ ok: true });
    expect(await prisma.classBooking.count({ where: { studentId: customer.id, scheduleId: sched.id, occurrenceDate: date, status: "SCHEDULED" } })).toBe(1);
    expect(await prisma.ownerReservation.count({ where: { groupId: mine.groupId, releasedAt: null } })).toBe(0);
    expect(await prisma.auditLog.findFirst({ where: { actorId: owner.id, action: "reservation.book", targetId: customer.id } })).toBeTruthy();
    expect(await bookReservedHour(ownerActor(), mine.groupId, sched.id, 1)).toMatchObject({ ok: false, error: "That reservation was already released." });

    const theirs = await createOwnerReservation(owner.id, { ...contact(unverified.email), date: iso(tuesdays[6]), hours: [{ scheduleId: sched.id, chunkIndex: 0 }] });
    expect((await bookReservedHour(ownerActor(), theirs.groupId, sched.id, 0)) as { error: string }).toMatchObject({ ok: false });
    expect(((await bookReservedHour(ownerActor(), theirs.groupId, sched.id, 0)) as { error: string }).error).toMatch(/not verified/);
  });
});

describe("a day the studio does not usually teach", () => {
  it("can be kept for a customer at a typed time, which blocks others, and Book it books the customer there", async () => {
    const day = offDays()[2];
    await expect(createOwnerReservation(owner.id, { ...contact(customer.email), date: day, hours: null })).rejects.toThrow(/Type a start time/);
    await expect(createOwnerReservation(owner.id, { ...contact(customer.email), date: iso(tuesdays[6]), hours: null, time: "13:00" })).rejects.toThrow(/has weekly times/);
    const kept = await createOwnerReservation(owner.id, { ...contact(customer.email), date: day, hours: null, time: "13:00" });
    expect(kept.when).toMatch(/at 1:00 PM$/);
    await expect(createOwnerReservation(owner.id, { ...contact(customer.email), date: day, hours: null, time: "13:30" })).rejects.toThrow(/already kept/);

    const blocked = await adminBookForStudent(ownerActor(), stranger.id, { date: day, time: "13:15" });
    expect((blocked as { error: string }).error).toMatch(/reserved by the owner/);

    const group = (await listOwnerReservations()).find((g) => g.groupId === kept.groupId)!;
    expect(group).toMatchObject({ accountId: customer.id, what: "1:00 PM" });
    expect(group.hours).toHaveLength(1);
    const r = await bookReservedHour(ownerActor(), kept.groupId, group.hours[0].scheduleId, group.hours[0].chunkIndex);
    expect(r).toMatchObject({ ok: true });
    expect(await prisma.ownerReservation.count({ where: { groupId: kept.groupId, releasedAt: null } })).toBe(0);
  });

  it("a time kept that way still blocks a weekly window added later on that weekday", async () => {
    const day = offDays()[3];
    await createOwnerReservation(owner.id, { ...contact(customer.email), date: day, hours: null, time: "15:00" });
    const later = await prisma.classSchedule.create({ data: { dayOfWeek: offDay, startTime: "15:00", durationMin: 60, creditCost: 2, label: `${tag} later` } });
    extraSchedules.push(later.id);
    const date = new Date(`${day}T00:00:00Z`);
    await expect(bookClass(stranger.id, later.id, date.getTime(), 0)).rejects.toThrow(/reserved by the owner/);
    const seen = (await getUpcomingOccurrences(stranger.id)).find((o) => o.scheduleId === later.id && o.occurrenceDate.getTime() === date.getTime());
    expect(seen).toMatchObject({ isBooked: true, reservedByOwner: true });
    const theirs = (await getUpcomingOccurrences(customer.id)).find((o) => o.scheduleId === later.id && o.occurrenceDate.getTime() === date.getTime());
    expect(theirs).toMatchObject({ isBooked: false, reservedForYou: true });
    await prisma.classSchedule.update({ where: { id: later.id }, data: { active: false } });
  });
});

describe("the studio's open times", () => {
  it("name a contact's hold on a time, but not one kept for this very person, and show the student's own reserved time", async () => {
    const { getOpenSlotsAction } = await import("@/app/(dashboard)/admin/schedule/actions");
    const other = await prisma.contact.create({ data: { name: `${tag} Holly Hold`, email: `${tag}-holly@example.com` } });
    const self = await prisma.contact.create({ data: { name: `${tag} Self`, email: stranger.email } });
    await prisma.slotHold.create({ data: { contactId: other.id, scheduleId: sched.id, chunkIndex: 1 } });
    await prisma.slotHold.create({ data: { contactId: self.id, scheduleId: sched.id, chunkIndex: 0 } });
    const times = await getOpenSlotsAction(stranger.id);
    const mine = times.open.filter((s) => s.scheduleId === sched.id);
    expect(mine.length).toBeGreaterThan(0);
    for (const s of mine) {
      if (s.chunkIndex === 1) expect(s.heldFor).toBe(`${tag} Holly Hold`);
      else expect(s.heldFor).toBeUndefined();
    }
    expect(times.weekdays).toContain(2);
  });
});
