import { afterAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerSession: async () => null, getServerAuthSession: async () => null, authOptions: {} }));
import { applyPlanSetup, getPlanSetupContext, planSetupTypedSlot, previewPlanSetup } from "@/lib/planSetup";
import { moveWeeklyTime, typedWeeklyTimeChoice } from "@/lib/adminWeeklyTime";
import { moveWindowWithEveryone, previewWindowMove } from "@/lib/weeklyWindowMove";
import { ClassScheduleError, updateClassSchedule } from "@/lib/classScheduleManage";
import { moveClosedDayClasses, previewClosedDay, CLOSED_NAME } from "@/lib/adminClassTools";
import { addHold, listDirectory } from "@/lib/contacts";
import { setupLinkFor } from "@/lib/slotWaitlist";
import { adminPausePlan } from "@/lib/paymentPlans";
import { chunksForSchedule, computeScheduledAt, rescheduleClassBooking } from "@/lib/classSchedule";
import { calculatePaymentPlanRate, discountedPlanPriceCents, OFFERED_PLAN_CADENCE } from "@/lib/classCreditPricing";
import { getPricingConfig } from "@/lib/pricing";
import { sendRegisterInvite } from "@/lib/registerInvite";
import { createHash } from "node:crypto";
import { makeUser, newTag, prisma } from "./helpers";

const tag = newTag("wt");
const DAY = 86_400_000;
const ids: string[] = [];
const slotIds: string[] = [];
const contactIds: string[] = [];
let adminId = "";

const etYmd = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
/** The weekday (0 Sunday) a few days from now, Eastern, so the next class of a slot on it is always that day. */
const weekdayIn = (days: number) => new Date(`${etYmd(new Date(Date.now() + days * DAY))}T12:00:00Z`).getUTCDay();

async function person(label: string, name = `Wt ${label} Person`) {
  // Credits on hand, as a student with booked classes has: the studio's Reschedule checks them like any move.
  const u = await makeUser(`${tag}${label}`, name, { emailVerified: new Date(), classCredits: 8 });
  ids.push(u.id);
  return u;
}

async function owner() {
  if (!adminId) adminId = (await person("owner", "Owner Person").then((u) => prisma.user.update({ where: { id: u.id }, data: { role: "ADMIN" } }))).id;
  return adminId;
}

/** A weekly window on the weekday `daysAhead` from now, at an unusual time so no other test file shares it. */
async function slot(daysAhead: number, startTime: string, durationMin = 45) {
  const s = await prisma.classSchedule.create({ data: { dayOfWeek: weekdayIn(daysAhead), startTime, durationMin, creditCost: Math.ceil(durationMin / 30), label: `${tag} ${slotIds.length}` } });
  slotIds.push(s.id);
  return s;
}

/** A class on a window's class `chunkIndex`, on the calendar day `ymd`. */
async function bookOn(studentId: string, schedule: { id: string; startTime: string; durationMin: number }, ymd: string, chunkIndex = 0, planId: string | null = null) {
  const occurrenceDate = new Date(`${ymd}T00:00:00Z`);
  const scheduledAt = computeScheduledAt(schedule, occurrenceDate, chunksForSchedule(schedule)[chunkIndex]);
  return prisma.classBooking.create({ data: { studentId, scheduleId: schedule.id, occurrenceDate, scheduledAt, creditsSpent: 2, reservedByPlanId: planId } });
}

async function runningPlan(userId: string, scheduleId: string, chunkIndex = 0) {
  return prisma.paymentPlan.create({
    data: { userId, cadence: OFFERED_PLAN_CADENCE, term: "TERM_6", installmentAmountCents: 21999, creditsPerInstallment: 8, termMonths: 6, installmentsPaid: 1, nextDueDate: new Date(Date.now() + 20 * DAY), reservedScheduleId: scheduleId, reservedChunkIndex: chunkIndex },
  });
}

afterAll(async () => {
  const plans = await prisma.paymentPlan.findMany({ where: { userId: { in: ids } }, select: { reservedScheduleId: true } });
  const holds = await prisma.slotHold.findMany({ where: { contactId: { in: contactIds } }, select: { scheduleId: true } });
  const madeWindows = [...plans.map((p) => p.reservedScheduleId), ...holds.map((h) => h.scheduleId)].filter((x): x is string => Boolean(x));
  const bookedOn = await prisma.classBooking.findMany({ where: { studentId: { in: ids } }, select: { scheduleId: true } });
  const allSlots = [...new Set([...slotIds, ...madeWindows, ...bookedOn.map((b) => b.scheduleId)])];
  await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
  await prisma.mailMessage.deleteMany({ where: { userId: { in: ids } } }).catch(() => undefined);
  await prisma.classBooking.deleteMany({ where: { studentId: { in: ids } } });
  await prisma.creditGrant.deleteMany({ where: { userId: { in: ids } } });
  await prisma.zellePayment.deleteMany({ where: { userId: { in: ids } } });
  await prisma.paymentPlan.deleteMany({ where: { userId: { in: ids } } });
  await prisma.scholarshipCode.deleteMany({ where: { OR: [{ claimedById: { in: ids } }, { createdById: { in: ids } }] } });
  await prisma.auditLog.deleteMany({ where: { OR: [{ actorId: { in: ids } }, { targetId: { in: ids } }] } });
  await prisma.slotHold.deleteMany({ where: { contactId: { in: contactIds } } });
  await prisma.contact.deleteMany({ where: { id: { in: contactIds } } });
  await prisma.ownerReservation.deleteMany({ where: { createdById: { in: ids } } });
  // Only windows these tests made, and the hidden one-off rows their moves made when nothing else uses them.
  await prisma.classSchedule.deleteMany({ where: { id: { in: allSlots }, OR: [{ label: { startsWith: tag } }, { label: null }, { label: "One-off", bookings: { none: {} } }] } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
});

describe("Another time…", () => {
  it("Set up plan makes a 45 minute weekly window in the same step as the plan, and the time is then that plan's", async () => {
    const ownerId = await owner();
    const stu = await person("typed");
    const time = { dayOfWeek: weekdayIn(3), startTime: "06:05" };
    const choice = await planSetupTypedSlot(stu.id, time);
    expect(choice).toMatchObject({ scheduleId: "", newTime: time, clashes: [] });
    expect(choice.label).toMatch(/6:05 AM to 6:50 AM$/);
    // Nothing is made until the plan is set up.
    expect(await prisma.classSchedule.count({ where: { dayOfWeek: time.dayOfWeek, startTime: "06:05", active: true } })).toBe(0);

    const input = { userId: stu.id, scheduleId: "", chunkIndex: 0, newTime: time, firstClassDate: choice.dates[1], scholarship: { kind: "full" as const }, term: "TERM_6" as const };
    const preview = await previewPlanSetup(input);
    expect(preview.steps.some((s) => s.startsWith("Adds a new weekly time"))).toBe(true);
    await applyPlanSetup(ownerId, input);

    const plan = await prisma.paymentPlan.findFirstOrThrow({ where: { userId: stu.id, status: "ACTIVE" } });
    const window = await prisma.classSchedule.findUniqueOrThrow({ where: { id: plan.reservedScheduleId! } });
    expect(window).toMatchObject({ dayOfWeek: time.dayOfWeek, startTime: "06:05", durationMin: 45, active: true });
    expect(await prisma.auditLog.count({ where: { action: "schedule.add-time", targetId: window.id } })).toBe(1);

    // The same time typed for someone else is now this plan's time, said by name; a time running into it is refused.
    const other = await person("typed2");
    await expect(planSetupTypedSlot(other.id, time)).rejects.toThrow(/That is Wt's weekly time/);
    await expect(planSetupTypedSlot(other.id, { dayOfWeek: time.dayOfWeek, startTime: "06:35" })).rejects.toThrow(/runs into the 6:05 AM class/);
  });

  it("a contact's hold can keep a typed time, made as a window with the hold", async () => {
    const c = await prisma.contact.create({ data: { name: `${tag} Typed Contact` } });
    contactIds.push(c.id);
    const hold = await addHold(c.id, "", 0, null, null, { dayOfWeek: weekdayIn(4), startTime: "06:45" });
    expect(hold.createdWindowId).toBe(hold.scheduleId);
    expect(await prisma.classSchedule.findUniqueOrThrow({ where: { id: hold.scheduleId } })).toMatchObject({ startTime: "06:45", durationMin: 45 });
  });
});

describe("clashes named, not hidden", () => {
  it("lists who has a class on the time; the plan can start after it, or the class can move and the time is free", async () => {
    await owner();
    const stu = await person("clash");
    const ann = await person("ann", "Ann Clasher");
    const s = await slot(2, "06:15");
    const firstDates = (await getPlanSetupContext(stu.id)).slots.find((x) => x.scheduleId === s.id)!.dates;
    const annClass = await bookOn(ann.id, s, firstDates[1]);

    const ctx = await getPlanSetupContext(stu.id);
    const offered = ctx.slots.find((x) => x.scheduleId === s.id)!;
    expect(offered.clashes).toEqual([expect.objectContaining({ bookingId: annClass.id, firstName: "Ann", date: firstDates[1] })]);

    const input = { userId: stu.id, scheduleId: s.id, chunkIndex: 0, scholarship: { kind: "keep" as const }, term: "TERM_3" as const };
    await expect(previewPlanSetup({ ...input, firstClassDate: firstDates[0] })).rejects.toThrow(/Ann has a class at this time on .* Start after it, or move that class first/);
    // Starting after the clash is fine: nothing is booked before the first class.
    expect((await previewPlanSetup({ ...input, firstClassDate: firstDates[2] })).classDates[0]).toBe(firstDates[2]);

    // Moving Ann's class (the studio's Reschedule) frees the time from this week on.
    await rescheduleClassBooking(ann.id, annClass.id, "", 0, 0, undefined, { byAdmin: true, customTime: { date: firstDates[1], time: "09:00" } });
    expect((await getPlanSetupContext(stu.id)).slots.find((x) => x.scheduleId === s.id)!.clashes).toEqual([]);
    expect((await previewPlanSetup({ ...input, firstClassDate: firstDates[0] })).classDates[0]).toBe(firstDates[0]);
  });

  it("Weekly time names the clash and refuses until it moves; a typed time gets its own window", async () => {
    const ownerId = await owner();
    const stu = await person("wk");
    const bo = await person("bo", "Bo Inway");
    const home = await slot(5, "06:55");
    const target = await slot(6, "07:05");
    const plan = await runningPlan(stu.id, home.id);
    await bookOn(bo.id, target, etYmd(new Date(Date.now() + 6 * DAY)));

    await expect(moveWeeklyTime(plan.id, ownerId, target.id, 0)).rejects.toThrow(/Bo has a class at this time/);
    await expect(typedWeeklyTimeChoice(plan.id, { dayOfWeek: home.dayOfWeek, startTime: "06:55" })).rejects.toThrow(/already their weekly time/);

    const label = await moveWeeklyTime(plan.id, ownerId, { newTime: { dayOfWeek: target.dayOfWeek, startTime: "08:10" } });
    expect(label).toMatch(/8:10 AM to 8:55 AM$/);
    const moved = await prisma.paymentPlan.findUniqueOrThrow({ where: { id: plan.id } });
    expect(await prisma.classSchedule.findUniqueOrThrow({ where: { id: moved.reservedScheduleId! } })).toMatchObject({ dayOfWeek: target.dayOfWeek, startTime: "08:10", durationMin: 45 });
  });
});

describe("Set up plan fixes its refusals in place", () => {
  it("says what to do, with the payment, the plan or the lock it is about", async () => {
    const ownerId = await owner();
    const stu = await person("fix");
    const s = await slot(2, "07:15");
    const plan = await runningPlan(stu.id, s.id);
    await prisma.zellePayment.create({ data: { userId: stu.id, purpose: "PAYMENT_PLAN_INSTALLMENT", paymentPlanId: plan.id, amountCents: 21999, zelleHandle: "x", lessonQuantity: 8, installmentNumber: 2, status: "PENDING_REVIEW", senderName: "Wt Payer", submittedAt: new Date() } });
    const review = await getPlanSetupContext(stu.id);
    expect(review.blocked).toMatch(/waiting for review/);
    expect(review.fix).toMatchObject({ kind: "review", payment: { amountCents: 21999, senderName: "Wt Payer", installmentNumber: 2 } });

    await prisma.zellePayment.deleteMany({ where: { paymentPlanId: plan.id } });
    await adminPausePlan(plan.id, ownerId, new Date(Date.now() + 10 * DAY));
    expect((await getPlanSetupContext(stu.id)).fix).toEqual({ kind: "resume", planId: plan.id });

    await prisma.user.update({ where: { id: stu.id }, data: { paymentLockedAt: new Date() } });
    expect((await getPlanSetupContext(stu.id)).fix).toEqual({ kind: "unlock" });
  });

  it("a lower scholarship is one confirmed step: the current one ends and the new one is given", async () => {
    const ownerId = await owner();
    const stu = await person("lower");
    const s = await slot(2, "07:25");
    const dates = (await getPlanSetupContext(stu.id)).slots.find((x) => x.scheduleId === s.id)!.dates;
    const base = { userId: stu.id, scheduleId: s.id, chunkIndex: 0, firstClassDate: dates[0], term: "TERM_6" as const };
    await applyPlanSetup(ownerId, { ...base, scholarship: { kind: "full" } });
    const full = await prisma.scholarshipCode.findFirstOrThrow({ where: { claimedById: stu.id, revokedAt: null } });

    await expect(applyPlanSetup(ownerId, { ...base, scholarship: { kind: "percent", percent: 40 } })).rejects.toThrow(/already has a 100% scholarship/);
    expect((await previewPlanSetup({ ...base, scholarship: { kind: "percent", percent: 40, replace: true } })).steps[0]).toBe("Ends the 100% scholarship and gives 40% instead. No code to claim.");
    await applyPlanSetup(ownerId, { ...base, scholarship: { kind: "percent", percent: 40, replace: true } });

    expect((await prisma.scholarshipCode.findUniqueOrThrow({ where: { id: full.id } })).revokedAt).not.toBeNull();
    const live = await prisma.scholarshipCode.findMany({ where: { claimedById: stu.id, revokedAt: null } });
    expect(live.map((c) => c.percent)).toEqual([40]);
    const rate = calculatePaymentPlanRate(OFFERED_PLAN_CADENCE, "TERM_6", await getPricingConfig());
    expect((await prisma.paymentPlan.findFirstOrThrow({ where: { userId: stu.id, status: "ACTIVE" } })).installmentAmountCents).toBe(discountedPlanPriceCents(rate.installmentAmountCents, 40));
    expect(await prisma.auditLog.count({ where: { action: "scholarship.end", targetId: stu.id } })).toBe(1);
  });
});

describe("contacts' held times flow into plans", () => {
  it("a time kept for this person is picked first and released by the plan; one kept for someone else is named", async () => {
    const ownerId = await owner();
    const stu = await person("held");
    const mine = await slot(2, "07:35");
    const theirs = await slot(3, "07:35");
    const me = await prisma.contact.create({ data: { name: `${tag} Held Me`, email: stu.email.toUpperCase() } });
    const jo = await prisma.contact.create({ data: { name: `${tag} Jo`, email: `${tag}-jo@example.com` } });
    contactIds.push(me.id, jo.id);
    const myHold = await addHold(me.id, mine.id, 0, null, null);
    await addHold(jo.id, theirs.id, 0, null, null);

    const ctx = await getPlanSetupContext(stu.id);
    expect(ctx.preferredSlotKey).toBe(`${mine.id}:0`);
    expect(ctx.slots.find((x) => x.scheduleId === mine.id)!.holds).toEqual([{ contactName: `${tag} Held Me`, mine: true }]);
    expect(ctx.slots.find((x) => x.scheduleId === theirs.id)!.holds).toEqual([{ contactName: `${tag} Jo`, mine: false }]);

    const dates = ctx.slots.find((x) => x.scheduleId === mine.id)!.dates;
    const input = { userId: stu.id, scheduleId: mine.id, chunkIndex: 0, firstClassDate: dates[0], scholarship: { kind: "full" as const }, term: "TERM_6" as const };
    expect((await previewPlanSetup(input)).steps).toContain(`Releases the time kept for ${tag} Held Me on Contacts.`);
    await applyPlanSetup(ownerId, input);
    expect((await prisma.slotHold.findUniqueOrThrow({ where: { id: myHold.id } })).releasedAt).not.toBeNull();
    expect(await prisma.slotHold.count({ where: { contactId: jo.id, releasedAt: null } })).toBe(1);

    // On Contacts the person is listed once, as their account.
    const rows = await listDirectory(stu.email);
    expect(rows.filter((r) => r.email?.toLowerCase() === stu.email.toLowerCase()).map((r) => r.kind)).toEqual(["ACCOUNT"]);
  });

  it("the waitlist notice and a contact's held time open Set up plan with that time picked", () => {
    expect(setupLinkFor("u1", "s1", 2)).toBe("/admin/users/u1?do=setup&slot=s1:2");
  });

  it("the studio's sign-up link goes once, and never carries the owner's referral code", async () => {
    const ownerId = await owner();
    const target = `${tag}-signup@example.test`;
    expect(await sendRegisterInvite(ownerId, target, { fromStudio: true })).toBe("sent");
    expect(await sendRegisterInvite(ownerId, target, { fromStudio: true })).toBe("recent");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: ownerId } })).referralCode).toBeNull();
    await prisma.appSetting.deleteMany({ where: { key: `register-invite:${createHash("sha256").update(target).digest("hex").slice(0, 32)}` } });
    await prisma.rateLimitEvent.deleteMany({ where: { key: { in: [`register-invite:${ownerId}`, `register-invite-lookup:${ownerId}`] } } });
  });
});

describe("a window moves with everyone on it", () => {
  it("names who is on it, then moves the weekly plan and the other classes and turns the old window off", async () => {
    const ownerId = await owner();
    const sam = await person("sam", "Sam Mover");
    const ann = await person("annw", "Ann Mover");
    const w = await slot(2, "04:00", 105); // two classes: 4:00 and 5:00
    const plan = await runningPlan(sam.id, w.id, 1);
    const dates = (await getPlanSetupContext(ann.id)).slots.find((x) => x.scheduleId === w.id && x.chunkIndex === 0)!.dates;
    await bookOn(sam.id, w, dates[0], 1, plan.id);
    const annClass = await bookOn(ann.id, w, dates[1], 0);

    // An edit that moves nobody goes through; one that would is refused with their names.
    await updateClassSchedule(w.id, { dayOfWeek: w.dayOfWeek, startTime: "04:00", endTime: "05:45", label: `${tag} renamed` });
    const refusal = await updateClassSchedule(w.id, { dayOfWeek: (w.dayOfWeek + 1) % 7, startTime: "04:00", endTime: "05:45", label: null }).catch((e) => e);
    expect(refusal).toBeInstanceOf(ClassScheduleError);
    expect((refusal as ClassScheduleError).message).toMatch(/Sam \(weekly plan\) and Ann \(.+\) are on this time/);
    expect((refusal as ClassScheduleError).people.map((p) => p.userId).sort()).toEqual([sam.id, ann.id].sort());

    const to = { dayOfWeek: (w.dayOfWeek + 1) % 7, startTime: "04:00", endTime: "05:45", label: `${tag} moved` };
    const preview = await previewWindowMove(w.id, to);
    expect(preview.problems).toEqual([]);
    expect(preview.plans).toEqual([expect.objectContaining({ userId: sam.id, to: expect.stringMatching(/5:00 AM to 5:45 AM$/) })]);
    expect(preview.classes.map((c) => c.bookingId)).toEqual([annClass.id]);

    await moveWindowWithEveryone(ownerId, w.id, to);
    expect((await prisma.classSchedule.findUniqueOrThrow({ where: { id: w.id } })).active).toBe(false);
    const moved = await prisma.paymentPlan.findUniqueOrThrow({ where: { id: plan.id } });
    expect(moved.reservedScheduleId).not.toBe(w.id);
    expect(moved.reservedChunkIndex).toBe(1);
    const newWindow = await prisma.classSchedule.findUniqueOrThrow({ where: { id: moved.reservedScheduleId! } });
    expect(newWindow).toMatchObject({ dayOfWeek: to.dayOfWeek, startTime: "04:00", durationMin: 105, active: true });
    expect((await prisma.classBooking.findUniqueOrThrow({ where: { id: annClass.id } })).status).toBe("CANCELED");
    const annNow = await prisma.classBooking.findFirstOrThrow({ where: { studentId: ann.id, status: "SCHEDULED" } });
    expect(annNow.scheduleId).toBe(newWindow.id);
    expect(etYmd(annNow.scheduledAt)).toBe(new Date(Date.parse(`${dates[1]}T12:00:00Z`) + DAY).toISOString().slice(0, 10));
    expect(await prisma.classBooking.count({ where: { studentId: sam.id, scheduleId: w.id, status: "SCHEDULED" } })).toBe(0);
    // Each person is told once.
    for (const id of [sam.id, ann.id]) expect(await prisma.notification.count({ where: { userId: id, title: "Your class time moved" } })).toBe(1);
  });
});

describe("holiday make-ups", () => {
  it("Close a day can move its classes to another day instead, tell each student once, and still close the day", async () => {
    const ownerId = await owner();
    const admin = await prisma.user.findUniqueOrThrow({ where: { id: ownerId } });
    const stu = await person("holiday");
    const at = new Date(Date.now() + 340 * DAY);
    const date = etYmd(at);
    const s = await prisma.classSchedule.create({ data: { dayOfWeek: new Date(`${date}T12:00:00Z`).getUTCDay(), startTime: "10:00", durationMin: 45, creditCost: 2, label: `${tag} holiday` } });
    slotIds.push(s.id);
    const booking = await bookOn(stu.id, s, date);
    const preview = await previewClosedDay(date);
    const mine = preview.classes.find((c) => c.id === booking.id)!;
    expect(mine.time).toBe("10:00");

    const nextDay = new Date(Date.parse(`${date}T12:00:00Z`) + DAY).toISOString().slice(0, 10);
    const others = preview.classes.filter((c) => c.id !== booking.id);
    // Every class of the day must be given a place; only this test's class is checked below.
    const moves = [{ bookingId: booking.id, date: nextDay, time: "11:00" }, ...others.map((c, i) => ({ bookingId: c.id, date: nextDay, time: `${String(12 + i).padStart(2, "0")}:00` }))];
    await expect(moveClosedDayClasses(ownerId, admin.email, date, "Holiday", [{ bookingId: booking.id, date, time: "11:00" }, ...moves.slice(1)])).rejects.toThrow(/that one is being closed/);
    const done = await moveClosedDayClasses(ownerId, admin.email, date, "Holiday", moves);
    expect(done.moved).toBe(moves.length);

    expect((await prisma.classBooking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe("CANCELED");
    const now = await prisma.classBooking.findFirstOrThrow({ where: { studentId: stu.id, status: "SCHEDULED" } });
    expect(etYmd(now.scheduledAt)).toBe(nextDay);
    expect(now.scheduledAt.toLocaleTimeString("en-GB", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })).toBe("11:00");
    expect(await prisma.ownerReservation.count({ where: { occurrenceDate: new Date(`${date}T00:00:00Z`), name: CLOSED_NAME, releasedAt: null } })).toBeGreaterThanOrEqual(1);
    const notes = await prisma.notification.findMany({ where: { userId: stu.id } });
    expect(notes.map((n) => n.title)).toEqual(["Your class was moved"]);
    expect(notes[0].body).toMatch(/The studio is closed on .* \(Holiday\), so your .* class moved to .*No credits were charged\./);
  });
});
