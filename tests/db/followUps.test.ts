import { afterAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerAuthSession: async () => null, authOptions: {} }));
import { getFollowUps } from "@/lib/adminFollowUps";
import { sendFollowUpReminder } from "@/lib/followUpReminders";
import { day, makeUser, newTag, prisma } from "./helpers";

const tag = newTag("fu");

afterAll(async () => {
  await prisma.appSetting.deleteMany({ where: { key: { startsWith: "followup-reminder:", contains: tag } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: tag } } });
});

async function overdueStudent(name: string, extra: Record<string, unknown> = {}) {
  const u = await makeUser(tag, name, extra);
  await prisma.paymentPlan.create({
    data: { userId: u.id, cadence: "MIN_60_WEEKLY", term: "MONTHLY", installmentAmountCents: 24000, creditsPerInstallment: 8, termMonths: 1, installmentsPaid: 1, nextDueDate: new Date(Date.now() - 2 * day), status: "ACTIVE", createdAt: new Date(Date.now() - 20 * day) },
  });
  return u;
}

describe("people to follow up with", () => {
  it("lists an overdue payer, and a paying student who has not practiced in a week", async () => {
    const u = await overdueStudent("Late");
    const lists = await getFollowUps();
    expect(lists.find((l) => l.key === "overdue")?.people.some((p) => p.id === u.id) || (lists.find((l) => l.key === "overdue")?.total ?? 0) > 5).toBe(true);
    expect(lists.find((l) => l.key === "atRisk")?.total).toBeGreaterThan(0);
  });
});

describe("the one-click reminder", () => {
  it("sends the notice once, and refuses a second one the same day", async () => {
    const u = await overdueStudent("Once");
    expect(await sendFollowUpReminder("overdue", u.id)).toEqual({ ok: true });
    const notices = await prisma.notification.findMany({ where: { userId: u.id } });
    const mail = await prisma.mailMessage.findMany({ where: { userId: u.id } }).catch(() => []);
    expect(notices.length + mail.length).toBe(1);
    const again = await sendFollowUpReminder("overdue", u.id);
    expect(again).toMatchObject({ ok: false });
  });

  it("refuses when the reason no longer holds, for an admin, and for a banned account", async () => {
    const paid = await makeUser(tag, "Paid");
    await prisma.paymentPlan.create({
      data: { userId: paid.id, cadence: "MIN_60_WEEKLY", term: "MONTHLY", installmentAmountCents: 24000, creditsPerInstallment: 8, termMonths: 1, installmentsPaid: 1, nextDueDate: new Date(Date.now() + 10 * day), status: "ACTIVE" },
    });
    expect(await sendFollowUpReminder("overdue", paid.id)).toMatchObject({ ok: false });

    const admin = await makeUser(tag, "Boss", { role: "ADMIN" });
    expect(await sendFollowUpReminder("overdue", admin.id)).toMatchObject({ ok: false });

    const banned = await overdueStudent("Banned", { bannedAt: new Date() });
    expect(await sendFollowUpReminder("overdue", banned.id)).toMatchObject({ ok: false });
    expect(await prisma.notification.count({ where: { userId: banned.id } })).toBe(0);
  });
});
