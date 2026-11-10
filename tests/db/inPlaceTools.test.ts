import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
// The server actions read the signed-in admin from here.
vi.mock("@/lib/auth", () => ({
  getServerAuthSession: async () => (globalThis as { __ipAdmin?: object }).__ipAdmin ?? null,
  getServerSession: async () => null,
  authOptions: {},
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
import { getNeedsYouItems } from "@/lib/needsYouItems";
import { findNextOpenThread, getSupportAccountExtras } from "@/lib/supportAccount";
import { getNextScales } from "@/lib/nextScaleSummary";
import { notifyAutoApproved } from "@/lib/payments";
import { pausePaymentPlan } from "@/lib/paymentPlans";
import { OFFERED_PLAN_CADENCE } from "@/lib/classCreditPricing";
import { makeUser, newTag, prisma } from "./helpers";

const tag = newTag("ip");
const DAY = 86_400_000;
const ids: string[] = [];
const slotIds: string[] = [];
const threadIds: string[] = [];
let admin: { id: string; email: string };
let slotId = "";
let n = 0;
let autoSettingBefore: { employeesEnabled: boolean; ownerEnabled: boolean } | null = null;

async function person(name: string, extra: Record<string, unknown> = {}) {
  const u = await makeUser(`${tag}${n++}`, name, extra);
  ids.push(u.id);
  return u;
}
const scale = (order: number) => prisma.scaleGroup.findFirstOrThrow({ where: { order } });
const unlocked = async (userId: string, order: number) => {
  const sg = await scale(order);
  return Boolean((await prisma.scaleProgress.findUnique({ where: { userId_scaleGroupId: { userId, scaleGroupId: sg.id } } }))?.unlockedAt);
};

beforeAll(async () => {
  admin = await person("Desk Admin", { role: "ADMIN" });
  (globalThis as { __ipAdmin?: object }).__ipAdmin = { user: { id: admin.id, email: admin.email, role: "ADMIN" } };
  const slot = await prisma.classSchedule.create({ data: { dayOfWeek: 2, startTime: "11:00", durationMin: 45, creditCost: 2, label: `${tag} slot` } });
  slotId = slot.id;
  slotIds.push(slot.id);
  const row = await prisma.adminNotificationSetting.findUnique({ where: { kind: "PAYMENT_AUTO_APPROVED" } });
  autoSettingBefore = row ? { employeesEnabled: row.employeesEnabled, ownerEnabled: row.ownerEnabled } : null;
  await prisma.adminNotificationSetting.upsert({
    where: { kind: "PAYMENT_AUTO_APPROVED" },
    update: { employeesEnabled: true, ownerEnabled: true },
    create: { kind: "PAYMENT_AUTO_APPROVED", employeesEnabled: true, ownerEnabled: true },
  });
});

afterAll(async () => {
  (globalThis as { __ipAdmin?: object }).__ipAdmin = undefined;
  if (autoSettingBefore) await prisma.adminNotificationSetting.update({ where: { kind: "PAYMENT_AUTO_APPROVED" }, data: autoSettingBefore });
  else await prisma.adminNotificationSetting.deleteMany({ where: { kind: "PAYMENT_AUTO_APPROVED" } });
  await prisma.supportMessage.deleteMany({ where: { escalationId: { in: threadIds } } });
  await prisma.assistantEscalation.deleteMany({ where: { id: { in: threadIds } } });
  await prisma.bookingRequest.deleteMany({ where: { studentId: { in: ids } } });
  await prisma.classBooking.deleteMany({ where: { studentId: { in: ids } } });
  await prisma.zellePayment.deleteMany({ where: { userId: { in: ids } } });
  await prisma.creditGrant.deleteMany({ where: { userId: { in: ids } } });
  await prisma.paymentPlan.deleteMany({ where: { userId: { in: ids } } });
  await prisma.scaleProgress.deleteMany({ where: { userId: { in: ids } } });
  await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
  await prisma.idempotencyKey.deleteMany({ where: { userId: { in: ids } } });
  await prisma.auditLog.deleteMany({ where: { OR: [{ targetId: { in: ids } }, { actorId: { in: ids } }] } });
  await prisma.classSchedule.deleteMany({ where: { id: { in: slotIds } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
});

describe("the student page's Unlock tells the student", () => {
  it("sends 'A new scale is unlocked' once, only with Notify on, and never for a scale already open", async () => {
    const { toggleScaleUnlockAction } = await import("@/app/(dashboard)/admin/users/actions");
    const sg = await scale(1);
    const told = await person("Told Student", { hasCurriculumAccess: true });
    await toggleScaleUnlockAction(told.id, sg.slug, true, true);
    expect(await unlocked(told.id, 1)).toBe(true);
    const notices = await prisma.notification.findMany({ where: { userId: told.id, type: "CURRICULUM_ACCESS_GRANTED" } });
    expect(notices.map((x) => x.title)).toEqual(["A new scale is unlocked"]);
    expect(notices[0].body).toContain(sg.code);
    // Unlocking it again changes nothing and says nothing.
    await toggleScaleUnlockAction(told.id, sg.slug, true, true);
    expect(await prisma.notification.count({ where: { userId: told.id, type: "CURRICULUM_ACCESS_GRANTED" } })).toBe(1);

    const quiet = await person("Quiet Student", { hasCurriculumAccess: true });
    await toggleScaleUnlockAction(quiet.id, sg.slug, true, false);
    expect(await unlocked(quiet.id, 1)).toBe(true);
    expect(await prisma.notification.count({ where: { userId: quiet.id, type: "CURRICULUM_ACCESS_GRANTED" } })).toBe(0);
  });
});

describe("releasing the next scale from a class row or a chat", () => {
  it("offers Release anyway for the checklist rule, releases once on a double tap, and audits it", async () => {
    const { releaseNextScaleAction } = await import("@/app/(dashboard)/admin/inplace-actions");
    const u = await person("Fast Learner", { hasCurriculumAccess: true });
    expect((await getNextScales([u.id])).get(u.id)?.state).toBe("NEEDS_CHECKLIST");

    const refused = await releaseNextScaleAction(u.id, false, true);
    expect(refused).toMatchObject({ ok: false, canForce: true });
    expect(await unlocked(u.id, 1)).toBe(false);

    const key = `${tag}key01`;
    const [a, b] = await Promise.all([releaseNextScaleAction(u.id, true, true, key), releaseNextScaleAction(u.id, true, true, key)]);
    expect(a.ok || b.ok).toBe(true);
    // The same tap again gets the stored answer and releases nothing more.
    const again = await releaseNextScaleAction(u.id, true, true, key);
    expect(again.ok).toBe(true);
    expect(await unlocked(u.id, 1)).toBe(true);
    expect(await unlocked(u.id, 2)).toBe(false);
    expect(await prisma.notification.count({ where: { userId: u.id, type: "CURRICULUM_ACCESS_GRANTED" } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: "scale.release", targetId: u.id } })).toBe(1);
  });

  it("never offers to go past a missing plan", async () => {
    const { releaseNextScaleAction } = await import("@/app/(dashboard)/admin/inplace-actions");
    const u = await person("No Plan");
    expect(await getNextScales([u.id])).toEqual(new Map());
    expect(await releaseNextScaleAction(u.id, false, true)).toMatchObject({ ok: false, canForce: false });
    expect(await releaseNextScaleAction(u.id, true, true)).toMatchObject({ ok: false, canForce: false });
    expect(await unlocked(u.id, 1)).toBe(false);
  });
});

describe("Needs you rows that open in place", () => {
  it("lists payments to approve with Approve for the owner only, classes to mark with their day, and requests to book", async () => {
    const s = await person("Paying Person");
    const pay = await prisma.zellePayment.create({
      data: { userId: s.id, purpose: "CLASS_CREDITS", amountCents: 5599, zelleHandle: "x", status: "PENDING_REVIEW", submittedAt: new Date("1999-01-02T12:00:00Z") },
    });
    const owner = await getNeedsYouItems("payments", { isOwner: true, take: 1000 });
    const mine = owner.find((i) => i.key === pay.id)!;
    expect(mine.title).toBe("Paying Person, $55.99");
    expect(mine.href).toBe(`/admin/payments?id=${pay.id}`);
    expect(mine.action).toEqual({ kind: "approvePayment", id: pay.id });
    const staff = await getNeedsYouItems("payments", { isOwner: false, take: 1000 });
    expect(staff.find((i) => i.key === pay.id)?.action).toBeNull();

    const when = new Date(Date.now() - 2 * DAY);
    const b = await prisma.classBooking.create({ data: { studentId: s.id, scheduleId: slotId, occurrenceDate: new Date(Date.UTC(1999, 0, 3)), scheduledAt: when, creditsSpent: 2 } });
    const unmarked = (await getNeedsYouItems("unmarked", { isOwner: false, take: 1000 })).find((i) => i.key === b.id)!;
    expect(unmarked.action).toEqual({ kind: "mark", id: b.id });
    expect(unmarked.href).toMatch(/^\/admin\/today\?day=\d{4}-\d{2}-\d{2}$/);

    const r = await prisma.bookingRequest.create({ data: { studentId: s.id, scheduleId: slotId, occurrenceDate: new Date(Date.UTC(2031, 0, 7)), scheduledAt: new Date(Date.now() + 5 * DAY), chunkIndex: 0 } });
    const req = (await getNeedsYouItems("requests", { isOwner: false, take: 1000 })).find((i) => i.key === r.id)!;
    expect(req.action).toEqual({ kind: "confirmRequest", id: r.id });

    // A row with nothing to open in place gives nothing.
    expect(await getNeedsYouItems("jobs", { isOwner: true })).toEqual([]);
  });
});

describe("the support chat's account panel", () => {
  it("shows open bills (not paid ones, not a group member's), the next classes, and the next open chat", async () => {
    const s = await person("Chatty Student");
    const open = await prisma.zellePayment.create({ data: { userId: s.id, purpose: "PAYMENT_PLAN_INSTALLMENT", amountCents: 5500, zelleHandle: "x", status: "PENDING_REVIEW" } });
    await prisma.zellePayment.create({ data: { userId: s.id, purpose: "CLASS_CREDITS", amountCents: 1000, zelleHandle: "x", status: "VERIFIED" } });
    const head = await prisma.zellePayment.create({ data: { userId: s.id, purpose: "FAMILY_PLAN_INSTALLMENT", amountCents: 9000, zelleHandle: "x", status: "AWAITING_TRANSFER" } });
    await prisma.zellePayment.create({ data: { userId: s.id, purpose: "PAYMENT_PLAN_INSTALLMENT", amountCents: 4500, zelleHandle: "x", status: "AWAITING_TRANSFER", bundleId: head.id } });
    const soon = await prisma.classBooking.create({ data: { studentId: s.id, scheduleId: slotId, occurrenceDate: new Date(Date.UTC(2031, 1, 4)), scheduledAt: new Date(Date.now() + 3 * DAY), creditsSpent: 2 } });

    const extras = await getSupportAccountExtras(s.id);
    expect(extras.payments.map((p) => p.id).sort()).toEqual([open.id, head.id].sort());
    expect(extras.payments.find((p) => p.id === open.id)?.code).toMatch(/^BNP-/);
    expect(extras.classes.map((c) => c.id)).toEqual([soon.id]);
    expect(extras.nextScale).toBeNull();

    const here = await prisma.assistantEscalation.create({ data: { identifier: `${tag}-a`, contactEmail: s.email, userId: s.id } });
    const waiting = await prisma.assistantEscalation.create({ data: { identifier: `${tag}-b`, contactEmail: `${tag}-b@example.com`, contactName: "Waiting Visitor", createdAt: new Date("1999-01-01T00:00:00Z") } });
    const emailed = await prisma.assistantEscalation.create({ data: { identifier: `${tag}-c`, contactEmail: `${tag}-c@example.com`, source: "EMAIL", createdAt: new Date("1998-01-01T00:00:00Z") } });
    threadIds.push(here.id, waiting.id, emailed.id);
    expect(await findNextOpenThread(here.id)).toEqual({ id: waiting.id, name: "Waiting Visitor" });
    await prisma.assistantEscalation.update({ where: { id: waiting.id }, data: { status: "RESOLVED" } });
    expect((await findNextOpenThread(here.id))?.id).not.toBe(waiting.id);
    expect((await findNextOpenThread(here.id))?.id).not.toBe(emailed.id);
  });
});

describe("admin notices open the exact thing", () => {
  it("an automatic approval opens that payment, and a pause names the student and opens their page", async () => {
    const s = await person("Pausing Student");
    const pay = await prisma.zellePayment.create({ data: { userId: s.id, purpose: "CLASS_CREDITS", amountCents: 5500, zelleHandle: "x", status: "VERIFIED", autoApproved: true } });
    await notifyAutoApproved(pay.id);
    const auto = await prisma.notification.findFirst({ where: { userId: admin.id, title: "Payment approved automatically" }, orderBy: { createdAt: "desc" } });
    expect(auto?.href).toBe(`/admin/payments?id=${pay.id}`);

    const due = new Date(Date.now() + 20 * DAY);
    await prisma.paymentPlan.create({
      data: { userId: s.id, cadence: OFFERED_PLAN_CADENCE, term: "MONTHLY", installmentAmountCents: 5500, creditsPerInstallment: 8, termMonths: 1, installmentsPaid: 1, nextDueDate: due, reservedScheduleId: slotId, reservedChunkIndex: 0 },
    });
    await pausePaymentPlan(s.id, 1);
    const paused = await prisma.notification.findFirst({ where: { userId: admin.id, title: "Pausing Student paused their plan" } });
    expect(paused?.href).toBe(`/admin/users/${s.id}`);
  });
});
