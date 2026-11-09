import { afterAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerAuthSession: async () => null, authOptions: {} }));
import { getFollowUpPeople, getFollowUps } from "@/lib/adminFollowUps";
import { sendFollowUpReminder, sendFollowUpRemindersToAll } from "@/lib/followUpReminders";
import { getOrCreateOpenInstallmentPayment } from "@/lib/paymentPlans";
import { day, makeUser, newTag, prisma } from "./helpers";

const tag = newTag("fu");
const groupIds: string[] = [];

afterAll(async () => {
  const users = await prisma.user.findMany({ where: { email: { startsWith: tag } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  await prisma.appSetting.deleteMany({ where: { key: { startsWith: "followup-reminder:" } } });
  await prisma.zellePayment.updateMany({ where: { userId: { in: ids } }, data: { bundleId: null } });
  await prisma.zellePayment.deleteMany({ where: { userId: { in: ids } } });
  await prisma.paymentPlan.deleteMany({ where: { userId: { in: ids } } });
  await prisma.familyPlanGroup.deleteMany({ where: { id: { in: groupIds } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
});

const planData = (userId: string, extra: Record<string, unknown> = {}) => ({
  userId,
  cadence: "MIN_60_WEEKLY" as const,
  term: "MONTHLY" as const,
  installmentAmountCents: 24000,
  creditsPerInstallment: 8,
  termMonths: 1,
  installmentsPaid: 1,
  nextDueDate: new Date(Date.now() - 2 * day),
  status: "ACTIVE" as const,
  createdAt: new Date(Date.now() - 20 * day),
  ...extra,
});

async function overdueStudent(name: string, extra: Record<string, unknown> = {}) {
  const u = await makeUser(tag, name, extra);
  await prisma.paymentPlan.create({ data: planData(u.id) });
  return u;
}

/** A group (family or parent) whose members' bills are overdue: the payer has a plan too unless `payerLearns` is false. */
let groupCount = 0;
async function overdueGroup(kind: "FAMILY" | "PARENT", members: number, payerLearns = true) {
  const n = ++groupCount;
  const payer = await makeUser(tag, `Payer${kind}${n}`);
  const group = await prisma.familyPlanGroup.create({ data: { payerId: payer.id, kind } });
  groupIds.push(group.id);
  const kids: Awaited<ReturnType<typeof makeUser>>[] = [];
  const plans: { id: string }[] = [];
  if (payerLearns) plans.push(await prisma.paymentPlan.create({ data: planData(payer.id, { familyGroupId: group.id, installmentAmountCents: 15000 }) }));
  for (let i = 0; i < members; i++) {
    const kid = await makeUser(tag, `Kid${kind}${n}x${i}`);
    kids.push(kid);
    plans.push(await prisma.paymentPlan.create({ data: planData(kid.id, { familyGroupId: group.id, installmentAmountCents: 15000 }) }));
  }
  return { payer, kids, plans, groupId: group.id };
}

const mailFor = (userId: string) => prisma.mailMessage.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });

describe("people to follow up with", () => {
  it("lists an overdue payer, and a paying student who has not practiced in a week", async () => {
    const u = await overdueStudent("Late");
    const lists = await getFollowUps();
    const overdue = lists.find((l) => l.key === "overdue")!;
    expect([...overdue.people, ...overdue.more].some((p) => p.id === u.id)).toBe(true);
    expect(lists.find((l) => l.key === "atRisk")?.total).toBeGreaterThan(0);
  });

  it("names the first five, carries the rest for the screen to open, and links each heading to its own filtered list", async () => {
    for (let i = 0; i < 6; i++) await overdueStudent(`Many${i}`);
    const overdue = (await getFollowUps()).find((l) => l.key === "overdue")!;
    expect(overdue.people).toHaveLength(5);
    expect(overdue.people.length + overdue.more.length).toBe(overdue.total);
    expect(overdue.href).toBe("/admin/payment-plans?status=OVERDUE");
  });

  it("names the payer next to a member whose bill someone else pays", async () => {
    const g = await overdueGroup("PARENT", 1, false);
    const people = await getFollowUpPeople("overdue");
    expect(people.find((p) => p.id === g.kids[0].id)?.payer).toEqual({ id: g.payer.id, name: g.payer.name });
  });
});

describe("the one-click reminder", () => {
  it("sends the notice once, and refuses a second one the same day", async () => {
    const u = await overdueStudent("Once");
    expect(await sendFollowUpReminder("overdue", u.id)).toEqual({ ok: true, sentTo: u.id });
    const notices = await prisma.notification.findMany({ where: { userId: u.id } });
    const mail = await mailFor(u.id);
    expect(notices.length + mail.length).toBe(1);
    const again = await sendFollowUpReminder("overdue", u.id);
    expect(again).toMatchObject({ ok: false });
  });

  it("refuses when the reason no longer holds, for an admin, and for a banned account", async () => {
    const paid = await makeUser(tag, "Paid");
    await prisma.paymentPlan.create({ data: planData(paid.id, { nextDueDate: new Date(Date.now() + 10 * day) }) });
    expect(await sendFollowUpReminder("overdue", paid.id)).toMatchObject({ ok: false });

    const admin = await makeUser(tag, "Boss", { role: "ADMIN" });
    expect(await sendFollowUpReminder("overdue", admin.id)).toMatchObject({ ok: false });

    const banned = await overdueStudent("Banned", { bannedAt: new Date() });
    expect(await sendFollowUpReminder("overdue", banned.id)).toMatchObject({ ok: false });
    expect(await prisma.notification.count({ where: { userId: banned.id } })).toBe(0);
  });

  it("sends a child's overdue bill to the parent who pays it, never to the child, and only once a day for the whole group", async () => {
    const g = await overdueGroup("PARENT", 2, false);
    const res = await sendFollowUpReminder("overdue", g.kids[0].id);
    expect(res).toEqual({ ok: true, sentTo: g.payer.id });
    expect(await mailFor(g.kids[0].id)).toHaveLength(0);
    const [notice] = await mailFor(g.payer.id);
    expect(notice.title).toContain("bill is overdue");
    expect(notice.actionHref).toBe("/parent");
    // The second child's bill is the same payer's: already reminded today.
    expect(await sendFollowUpReminder("overdue", g.kids[1].id)).toMatchObject({ ok: false, error: expect.stringContaining(g.payer.name!) });
  });

  it("asks the payer for the group's combined bill, with the combined amount", async () => {
    const g = await overdueGroup("FAMILY", 2);
    const { payment } = await getOrCreateOpenInstallmentPayment(g.plans[0].id, "pay@example.test");
    expect(payment?.purpose).toBe("FAMILY_PLAN_INSTALLMENT");
    expect(await sendFollowUpReminder("overdue", g.kids[1].id)).toEqual({ ok: true, sentTo: g.payer.id });
    const [notice] = await mailFor(g.payer.id);
    expect(notice.title).toBe("Your combined bill is overdue");
    expect(notice.body).toContain("$450.00");
    expect(notice.body).toContain("3 people");
    expect(notice.actionHref).toBe("/billing/plans");
  });
});

describe("Remind all", () => {
  it("reminds everyone the reason applies to, once, and counts the rest as skipped", async () => {
    const a = await overdueStudent("BulkA");
    const g = await overdueGroup("PARENT", 2, false);
    const first = await sendFollowUpRemindersToAll("overdue");
    const sentTo = first.sent.map((s) => s.sentTo);
    expect(sentTo).toContain(a.id);
    expect(sentTo.filter((id) => id === g.payer.id)).toHaveLength(1);
    expect(sentTo).not.toContain(g.kids[0].id);
    expect(sentTo).not.toContain(g.kids[1].id);
    expect(first.skipped).toBeGreaterThanOrEqual(1);
    const again = await sendFollowUpRemindersToAll("overdue");
    expect(again.sent).toHaveLength(0);
  });
});
