import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerAuthSession: async () => null, getServerSession: async () => null, authOptions: {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
import {
  bookClass,
  bookFamilyClass,
  chunksForSchedule,
  computeScheduledAt,
  createReservedBookingIfAbsent,
  getReservableSlots,
  getUpcomingOccurrences,
  nextOccurrenceDates,
  PlanHoldError,
} from "@/lib/classSchedule";
import { assertSlotReservable } from "@/lib/paymentPlans";
import { ClassScheduleError, updateClassSchedule } from "@/lib/classScheduleManage";
import { OFFERED_PLAN_CADENCE } from "@/lib/classCreditPricing";
import { makeUser, newTag, prisma } from "./helpers";

// Seats per slot: how many students (and weekly plans) can share each hour-long class of a window. 1 is the old behavior.
const tag = newTag("st");
type U = { id: string; email: string };
type Sched = { id: string; dayOfWeek: number; startTime: string; durationMin: number; seats: number };
const mk = (dayOfWeek: number, startTime: string, seats: number, label: string) =>
  prisma.classSchedule.create({ data: { dayOfWeek, startTime, durationMin: 120, creditCost: 4, seats, label: `${tag} ${label}` } });

let one: Sched, three: Sched, pair: Sched, lower: Sched;
const users: U[] = [];
const verified = () => ({ classCredits: 20, emailVerified: new Date() });
async function person(name: string): Promise<U> {
  const u = await makeUser(tag, name, verified());
  users.push(u);
  return u;
}
let a: U, b: U, c: U, d: U, e: U, f: U, g: U, h: U, i: U, j: U, k: U, l: U;
const dates = (dow: number) => nextOccurrenceDates(dow, 10).slice(2);
const planFor = (userId: string, scheduleId: string, chunkIndex: number, familyGroupId: string | null = null) =>
  prisma.paymentPlan.create({
    data: {
      userId,
      cadence: OFFERED_PLAN_CADENCE,
      term: "TERM_3",
      installmentAmountCents: 5500,
      creditsPerInstallment: 8,
      termMonths: 3,
      installmentsPaid: 1,
      nextDueDate: new Date(Date.now() + 25 * 86_400_000),
      reservedScheduleId: scheduleId,
      reservedChunkIndex: chunkIndex,
      familyGroupId,
    },
  });
const find = async (viewer: string | undefined, s: Sched, date: Date, chunkIndex: number) =>
  (await getUpcomingOccurrences(viewer)).find((o) => o.scheduleId === s.id && o.occurrenceDate.getTime() === date.getTime() && o.chunkIndex === chunkIndex)!;

beforeAll(async () => {
  [a, b, c, d, e, f, g] = [await person("Ann"), await person("Bo"), await person("Cy"), await person("Di"), await person("Ed"), await person("Flo"), await person("Gus")];
  [h, i, j, k, l] = [await person("Hal"), await person("Ida"), await person("Jo"), await person("Kit"), await person("Lee")];
  one = await mk(2, "09:00", 1, "one");
  three = await mk(3, "09:00", 3, "three");
  pair = await mk(4, "09:00", 2, "pair");
  lower = await mk(5, "09:00", 3, "lower");
  // Friends, so a family class can be booked together.
  for (const [x, y] of [[a, b], [a, c], [a, d], [a, e], [a, f], [a, g]]) await prisma.friendRequest.create({ data: { senderId: x.id, receiverId: y.id, status: "ACCEPTED" } });
});

afterAll(async () => {
  const ids = users.map((u) => u.id);
  const schedules = [one.id, three.id, pair.id, lower.id];
  await prisma.classBooking.deleteMany({ where: { scheduleId: { in: schedules } } });
  await prisma.paymentPlan.deleteMany({ where: { userId: { in: ids } } });
  await prisma.friendRequest.deleteMany({ where: { OR: [{ senderId: { in: ids } }, { receiverId: { in: ids } }] } });
  await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
  await prisma.classSchedule.deleteMany({ where: { id: { in: schedules } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
});

describe("one seat per slot is exactly the old behavior", () => {
  it("a second student is refused, and the slot reads as taken", async () => {
    const date = dates(2)[0];
    await bookClass(a.id, one.id, date.getTime(), 0);
    await expect(bookClass(b.id, one.id, date.getTime(), 0)).rejects.toThrow(/just booked by someone else/);
    expect(await find(b.id, one, date, 0)).toMatchObject({ seats: 1, seatsLeft: 0, isBooked: true });
    // The other hour of the window is a different slot.
    await bookClass(b.id, one.id, date.getTime(), 1);
  });

  it("a family is refused from a slot someone has, and still fits an empty one-seat slot as one party", async () => {
    const date = dates(2)[1];
    await bookClass(c.id, one.id, date.getTime(), 0);
    await expect(bookFamilyClass(a.id, one.id, date.getTime(), 0, [a.email, d.email])).rejects.toThrow(/just booked/);
    const made = await bookFamilyClass(a.id, one.id, date.getTime(), 1, [a.email, d.email]);
    expect(made).toHaveLength(2);
    await expect(bookClass(e.id, one.id, date.getTime(), 1)).rejects.toThrow(/just booked by someone else/);
  });
});

describe("several seats", () => {
  it("lets three students share an hour and refuses the fourth; a free seat shows and a cancel frees one", async () => {
    const date = dates(3)[0];
    await bookClass(a.id, three.id, date.getTime(), 0);
    await bookClass(b.id, three.id, date.getTime(), 0);
    expect(await find(c.id, three, date, 0)).toMatchObject({ seats: 3, seatsLeft: 1, isBooked: false });
    await bookClass(c.id, three.id, date.getTime(), 0);
    expect(await find(d.id, three, date, 0)).toMatchObject({ seatsLeft: 0, isBooked: true });
    await expect(bookClass(d.id, three.id, date.getTime(), 0)).rejects.toThrow(/just booked by someone else/);
    // Your own seat does not read as open for you.
    expect(await find(a.id, three, date, 0)).toMatchObject({ isBooked: true });

    await prisma.classBooking.updateMany({ where: { studentId: b.id, scheduleId: three.id, occurrenceDate: date }, data: { status: "CANCELED" } });
    expect(await find(d.id, three, date, 0)).toMatchObject({ seatsLeft: 1, isBooked: false });
    await bookClass(d.id, three.id, date.getTime(), 0);
  });

  it("a family of two needs two free seats", async () => {
    const date = dates(3)[1];
    await bookClass(g.id, three.id, date.getTime(), 0);
    await bookClass(f.id, three.id, date.getTime(), 0);
    // One seat left: a family of two does not fit.
    await expect(bookFamilyClass(a.id, three.id, date.getTime(), 0, [a.email, d.email])).rejects.toThrow(/just booked/);
    await prisma.classBooking.updateMany({ where: { studentId: f.id, scheduleId: three.id, occurrenceDate: date }, data: { status: "CANCELED" } });
    const made = await bookFamilyClass(a.id, three.id, date.getTime(), 0, [a.email, d.email]);
    expect(made).toHaveLength(2);
    expect(await find(e.id, three, date, 0)).toMatchObject({ seatsLeft: 0, isBooked: true });
  });
});

describe("weekly plans share seats too", () => {
  it("two plans can hold one time with two seats, the third is refused", async () => {
    const hold = (userId: string) => prisma.$transaction((tx) => assertSlotReservable(tx, pair.id, 0, 2, [userId]));
    await hold(a.id);
    const p1 = await planFor(a.id, pair.id, 0);
    await hold(b.id);
    const p2 = await planFor(b.id, pair.id, 0);
    await expect(hold(c.id)).rejects.toThrow(/just taken/);
    expect((await getReservableSlots(2)).some((s) => s.scheduleId === pair.id && s.chunkIndex === 0)).toBe(false);
    expect((await getReservableSlots(2)).find((s) => s.scheduleId === pair.id && s.chunkIndex === 1)).toMatchObject({ seats: 2, seatsLeft: 2 });

    // The weekly job books both plans' classes.
    const schedule = await prisma.classSchedule.findUniqueOrThrow({ where: { id: pair.id } });
    const date = dates(4)[0];
    const scheduledAt = computeScheduledAt(schedule, date, chunksForSchedule(schedule)[0]);
    const params = (studentId: string, planId: string) => ({ studentId, scheduleId: pair.id, occurrenceDate: date, scheduledAt, creditsSpent: 2, planId });
    expect(await createReservedBookingIfAbsent(params(a.id, p1.id))).toMatchObject({ studentId: a.id });
    expect(await createReservedBookingIfAbsent(params(b.id, p2.id))).toMatchObject({ studentId: b.id });
    // The hour is full now: another student cannot book it, and a third plan's class is skipped.
    await expect(bookClass(c.id, pair.id, date.getTime(), 0)).rejects.toThrow(/just booked by someone else/);
    const p3 = await planFor(c.id, pair.id, 0);
    expect(await createReservedBookingIfAbsent(params(c.id, p3.id))).toBeNull();
    await prisma.paymentPlan.delete({ where: { id: p3.id } });
  });

  it("a plan that has no class there yet still keeps a seat", async () => {
    const date = dates(4)[1];
    // Plan a and b hold chunk 0; chunk 1 is held by d's plan only, with no class booked.
    const p = await planFor(d.id, pair.id, 1);
    const open = await find(e.id, pair, date, 1);
    expect(open).toMatchObject({ seats: 2, seatsLeft: 1, isBooked: false });
    await bookClass(e.id, pair.id, date.getTime(), 1);
    expect(await find(f.id, pair, date, 1)).toMatchObject({ seatsLeft: 0, isBooked: true, reservedByPlan: true });
    await expect(bookClass(f.id, pair.id, date.getTime(), 1)).rejects.toBeInstanceOf(PlanHoldError);
    // Once the plan holder has their class there, it is one seat, not two.
    const schedule = await prisma.classSchedule.findUniqueOrThrow({ where: { id: pair.id } });
    const scheduledAt = computeScheduledAt(schedule, date, chunksForSchedule(schedule)[1]);
    expect(await createReservedBookingIfAbsent({ studentId: d.id, scheduleId: pair.id, occurrenceDate: date, scheduledAt, creditsSpent: 2, planId: p.id })).toMatchObject({ studentId: d.id });
    expect(await find(f.id, pair, date, 1)).toMatchObject({ seatsLeft: 0, isBooked: true });
  });
});

describe("changing the seats", () => {
  const input = (seats: number | undefined) => ({ dayOfWeek: 5, startTime: "09:00", endTime: "11:00", label: `${tag} lower`, seats });

  it("is refused below the people already on an upcoming hour, naming it", async () => {
    const date = dates(5)[0];
    await bookClass(h.id, lower.id, date.getTime(), 0);
    await bookClass(i.id, lower.id, date.getTime(), 0);
    await bookClass(j.id, lower.id, date.getTime(), 0);
    await expect(updateClassSchedule(lower.id, input(2))).rejects.toThrow(/already has 3 people on it/);
    await updateClassSchedule(lower.id, input(3));
    await prisma.classBooking.updateMany({ where: { studentId: j.id, scheduleId: lower.id }, data: { status: "CANCELED" } });
    expect((await updateClassSchedule(lower.id, input(2))).seats).toBe(2);
  });

  it("counts a plan that keeps the time, rejects nonsense, and keeps the seats when the edit leaves them out", async () => {
    await prisma.classBooking.updateMany({ where: { scheduleId: lower.id }, data: { status: "CANCELED" } });
    const p = await planFor(k.id, lower.id, 1);
    await updateClassSchedule(lower.id, input(2));
    const second = await planFor(l.id, lower.id, 1);
    await expect(updateClassSchedule(lower.id, input(1))).rejects.toThrow(/weekly plans\) already has 2 people/);
    await prisma.paymentPlan.deleteMany({ where: { id: { in: [p.id, second.id] } } });
    for (const bad of [0, -1, 1.5, 1001]) await expect(updateClassSchedule(lower.id, input(bad))).rejects.toBeInstanceOf(ClassScheduleError);
    await expect(updateClassSchedule(lower.id, input(1001))).rejects.toThrow(/at most 1000/);
    await updateClassSchedule(lower.id, input(1000));
    expect((await updateClassSchedule(lower.id, input(undefined))).seats).toBe(1000);
  });
});
