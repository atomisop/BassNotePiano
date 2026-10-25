import { afterAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerAuthSession: async () => null, authOptions: {} }));
import { getTakenSlots, joinWaitlist, leaveWaitlist, notifyOpenedSlots, WaitlistError } from "@/lib/slotWaitlist";
import { OWNER_EMAIL } from "@/lib/adminNotifications";
import { makeUser, newTag, prisma } from "./helpers";

const tag = newTag("wl");
const ids: string[] = [];
const slots: string[] = [];

afterAll(async () => {
  await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
  await prisma.slotWaitlist.deleteMany({ where: { userId: { in: ids } } });
  await prisma.paymentPlan.deleteMany({ where: { userId: { in: ids } } });
  await prisma.classSchedule.deleteMany({ where: { id: { in: slots } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
});

async function setup() {
  const holder = await makeUser(`${tag}h${ids.length}`, "Holder One");
  const first = await makeUser(`${tag}f${ids.length}`, "First InLine");
  const second = await makeUser(`${tag}s${ids.length}`, "Second InLine");
  ids.push(holder.id, first.id, second.id);
  const slot = await prisma.classSchedule.create({ data: { dayOfWeek: 4, startTime: "19:00", durationMin: 45, creditCost: 2, label: `${tag} slot${slots.length}` } });
  slots.push(slot.id);
  const plan = await prisma.paymentPlan.create({
    data: { userId: holder.id, cadence: "MIN_60_WEEKLY", term: "TERM_3", installmentAmountCents: 20000, creditsPerInstallment: 8, termMonths: 3, installmentsPaid: 1, nextDueDate: new Date(Date.now() + 20 * 86_400_000), reservedScheduleId: slot.id, reservedChunkIndex: 0 },
  });
  return { holder, first, second, slot, plan };
}

describe("slot waitlist", () => {
  it("only lets people wait for a time that is taken, and tells the first in line once it frees up", async () => {
    const s = await setup();
    expect((await getTakenSlots()).some((t) => t.scheduleId === s.slot.id)).toBe(true);
    await joinWaitlist(s.first.id, s.slot.id, 0);
    await joinWaitlist(s.second.id, s.slot.id, 0);
    await joinWaitlist(s.second.id, s.slot.id, 0); // joining twice is harmless

    const quiet = await notifyOpenedSlots(new Date());
    expect(quiet.notified).toBe(0); // still held by the plan

    await prisma.paymentPlan.update({ where: { id: s.plan.id }, data: { status: "CANCELED", canceledAt: new Date() } });
    const now = new Date();
    expect((await notifyOpenedSlots(now)).notified).toBeGreaterThanOrEqual(1);
    expect(await prisma.notification.count({ where: { userId: s.first.id, type: "SLOT_WAITLIST_OPENED" } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: s.second.id, type: "SLOT_WAITLIST_OPENED" } })).toBe(0);

    await notifyOpenedSlots(new Date(now.getTime() + 3_600_000)); // inside the 24 hour hold: nobody else is told yet
    expect(await prisma.notification.count({ where: { userId: s.second.id, type: "SLOT_WAITLIST_OPENED" } })).toBe(0);

    await notifyOpenedSlots(new Date(now.getTime() + 25 * 3_600_000)); // hold over: the next in line hears
    expect(await prisma.notification.count({ where: { userId: s.second.id, type: "SLOT_WAITLIST_OPENED" } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: s.first.id, type: "SLOT_WAITLIST_OPENED" } })).toBe(1);
  });

  it("refuses a time that is open, and caps how many a person can wait for", async () => {
    const s = await setup();
    await prisma.paymentPlan.update({ where: { id: s.plan.id }, data: { status: "CANCELED", canceledAt: new Date() } });
    await expect(joinWaitlist(s.first.id, s.slot.id, 0)).rejects.toBeInstanceOf(WaitlistError);
    await expect(joinWaitlist(s.first.id, s.slot.id, 99)).rejects.toBeInstanceOf(WaitlistError);
    await leaveWaitlist(s.first.id, s.slot.id, 0); // leaving a list you are not on is harmless
  });

  it("clears an entry once the person holds that very time themselves", async () => {
    const s = await setup();
    await joinWaitlist(s.first.id, s.slot.id, 0);
    await prisma.paymentPlan.update({ where: { id: s.plan.id }, data: { status: "CANCELED", canceledAt: new Date() } });
    await prisma.paymentPlan.create({
      data: { userId: s.first.id, cadence: "MIN_60_WEEKLY", term: "TERM_3", installmentAmountCents: 20000, creditsPerInstallment: 8, termMonths: 3, installmentsPaid: 0, nextDueDate: new Date(Date.now() + 20 * 86_400_000), reservedScheduleId: s.slot.id, reservedChunkIndex: 0 },
    });
    const r = await notifyOpenedSlots(new Date());
    expect(r.cleared).toBeGreaterThanOrEqual(1);
    expect(await prisma.slotWaitlist.count({ where: { userId: s.first.id } })).toBe(0);
  });

  it("tells the owner, and only the owner, once, when someone starts waiting for a time", async () => {
    const s = await setup();
    const owner = (await prisma.user.findFirst({ where: { email: { equals: OWNER_EMAIL, mode: "insensitive" } } })) ?? (await prisma.user.create({ data: { email: OWNER_EMAIL, name: "Owner", passwordHash: "x", role: "ADMIN" } }));
    const otherAdmin = await makeUser(`${tag}a${ids.length}`, "Other Admin", { role: "ADMIN" });
    ids.push(owner.id, otherAdmin.id);
    const noticesFor = (userId: string) => prisma.notification.findMany({ where: { userId, type: "ADMIN_ALERT", title: "Someone is waiting for a weekly time" } });
    const before = (await noticesFor(owner.id)).length;

    await joinWaitlist(s.first.id, s.slot.id, 0);
    await joinWaitlist(s.first.id, s.slot.id, 0); // asking again is not news
    const notices = await noticesFor(owner.id);
    expect(notices.length - before).toBe(1);
    const latest = notices.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    expect(latest.body).toBe("First InLine is looking forward to Thursdays at 7:00 PM becoming available.");

    expect((await noticesFor(otherAdmin.id)).length).toBe(0); // not other admins
    expect((await noticesFor(s.first.id)).length).toBe(0); // not the student
    await joinWaitlist(s.second.id, s.slot.id, 0); // a second person is a second notice
    expect((await noticesFor(owner.id)).length - before).toBe(2);

    await leaveWaitlist(s.first.id, s.slot.id, 0);
    await joinWaitlist(s.first.id, s.slot.id, 0); // leaving and coming back is a new request
    expect((await noticesFor(owner.id)).length - before).toBe(3);
  });

  it("does not tell the owner about their own entry", async () => {
    const s = await setup();
    const owner = (await prisma.user.findFirst({ where: { email: { equals: OWNER_EMAIL, mode: "insensitive" } } })) ?? (await prisma.user.create({ data: { email: OWNER_EMAIL, name: "Owner", passwordHash: "x", role: "ADMIN" } }));
    ids.push(owner.id);
    const before = await prisma.notification.count({ where: { userId: owner.id, type: "ADMIN_ALERT", title: "Someone is waiting for a weekly time" } });
    await joinWaitlist(owner.id, s.slot.id, 0);
    expect(await prisma.notification.count({ where: { userId: owner.id, type: "ADMIN_ALERT", title: "Someone is waiting for a weekly time" } })).toBe(before);
  });
});
