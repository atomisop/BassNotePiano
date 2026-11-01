import { afterAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerSession: async () => null, getServerAuthSession: async () => null, authOptions: {} }));
import { canonicalEmail } from "@/lib/canonicalEmail";
import { adminLinkParent, adminUnlinkParent, changeGroupPayer, getGroupView, listLinksFor, separateFromGroup } from "@/lib/adminGroupTools";
import { editRecordedPayment } from "@/lib/adminPaymentTools";
import { updateAnnouncement } from "@/lib/announcements";
import { newTag, prisma } from "./helpers";

const tag = newTag("agt");
const DAY = 86_400_000;
const emails: string[] = [];
const groupIds: string[] = [];
const announcementIds: string[] = [];

async function account(label: string, role: "STUDENT" | "ADMIN" = "STUDENT") {
  const email = `${tag}-${label}-${emails.length}@example.test`;
  emails.push(email);
  return prisma.user.create({ data: { email, name: `${label} Tester${emails.length}`, passwordHash: "x", emailCanonical: canonicalEmail(email), role } });
}

async function group(kind: "FAMILY" | "PARENT", size: number) {
  const admin = await account("admin", "ADMIN");
  const people = [];
  for (let i = 0; i < size; i++) people.push(await account(`member${i}`));
  const g = await prisma.familyPlanGroup.create({ data: { payerId: people[0].id, kind } });
  groupIds.push(g.id);
  const plans = [];
  for (const p of people) {
    plans.push(
      await prisma.paymentPlan.create({
        data: { userId: p.id, cadence: "MIN_60_WEEKLY", term: "TERM_6", installmentAmountCents: 15000, creditsPerInstallment: 8, termMonths: 6, installmentsPaid: 1, nextDueDate: new Date(Date.now() + 10 * DAY), familyGroupId: g.id },
      }),
    );
  }
  return { admin, people, groupId: g.id, plans };
}

afterAll(async () => {
  const users = await prisma.user.findMany({ where: { email: { in: emails } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
  await prisma.auditLog.deleteMany({ where: { actorId: { in: ids } } });
  await prisma.parentLink.deleteMany({ where: { OR: [{ parentId: { in: ids } }, { childId: { in: ids } }] } });
  await prisma.zellePayment.deleteMany({ where: { userId: { in: ids } } });
  await prisma.paymentPlan.deleteMany({ where: { userId: { in: ids } } });
  await prisma.familyPlanGroup.deleteMany({ where: { id: { in: groupIds } } });
  await prisma.announcement.deleteMany({ where: { id: { in: announcementIds } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
});

describe("group plan tools", () => {
  it("moves one member onto their own plan at the solo price and closes their group bill", async () => {
    const { admin, plans } = await group("FAMILY", 3);
    const bill = await prisma.zellePayment.create({ data: { userId: plans[1].userId, paymentPlanId: plans[1].id, purpose: "PAYMENT_PLAN_INSTALLMENT", installmentNumber: 2, amountCents: 15000, zelleHandle: "x", status: "AWAITING_TRANSFER" } });
    await separateFromGroup(admin.id, plans[1].id);
    const after = await prisma.paymentPlan.findUniqueOrThrow({ where: { id: plans[1].id } });
    expect(after.familyGroupId).toBeNull();
    expect(after.installmentAmountCents).not.toBe(15000);
    expect(after.installmentsPaid).toBe(1);
    expect((await prisma.zellePayment.findUniqueOrThrow({ where: { id: bill.id } })).status).toBe("EXPIRED");
    await expect(separateFromGroup(admin.id, plans[1].id)).rejects.toThrow(/not part of a group/);
  });

  it("will not take the payer off while others depend on them, until someone else pays", async () => {
    const { admin, people, groupId, plans } = await group("FAMILY", 2);
    await expect(separateFromGroup(admin.id, plans[0].id)).rejects.toThrow(/pays for the group/);
    const view = await getGroupView(groupId);
    expect(view.payerChoices.map((c) => c.id)).toEqual([people[1].id]);
    await expect(changeGroupPayer(admin.id, groupId, admin.id)).rejects.toThrow(/has to be someone on the group/);
    await changeGroupPayer(admin.id, groupId, people[1].id);
    expect((await prisma.familyPlanGroup.findUniqueOrThrow({ where: { id: groupId } })).payerId).toBe(people[1].id);
    await separateFromGroup(admin.id, plans[0].id);
    expect((await prisma.paymentPlan.findUniqueOrThrow({ where: { id: plans[0].id } })).familyGroupId).toBeNull();
  });
});

describe("parent links by the studio", () => {
  it("links a parent and child at once, refuses the reverse, and ends it", async () => {
    const admin = await account("admin", "ADMIN");
    const parent = await account("parent");
    const child = await account("child");
    await adminLinkParent(admin.id, parent.id, child.email.toUpperCase(), "parent");
    const link = await prisma.parentLink.findFirstOrThrow({ where: { parentId: parent.id, childId: child.id } });
    expect(link.status).toBe("ACCEPTED");
    await expect(adminLinkParent(admin.id, child.id, parent.email, "parent")).rejects.toThrow(/other way round/);
    await expect(adminLinkParent(admin.id, parent.id, child.email, "parent")).rejects.toThrow(/already linked/);
    await expect(adminLinkParent(admin.id, parent.id, admin.email, "parent")).rejects.toThrow(/cannot be linked/);
    const rows = await listLinksFor(child.id);
    expect(rows).toEqual([expect.objectContaining({ role: "parent", otherId: parent.id, status: "ACCEPTED" })]);
    await adminUnlinkParent(admin.id, child.id, link.id);
    expect(await prisma.parentLink.count({ where: { parentId: parent.id, childId: child.id } })).toBe(0);
    // a stranger's link cannot be ended through another account's page
    const other = await account("other");
    await adminLinkParent(admin.id, parent.id, other.email, "parent");
    const otherLink = await prisma.parentLink.findFirstOrThrow({ where: { parentId: parent.id, childId: other.id } });
    await expect(adminUnlinkParent(admin.id, child.id, otherLink.id)).rejects.toThrow(/no longer exists/);
  });

  it("lets a parent plan change payer only to a parent linked to every child", async () => {
    const { admin, people, groupId } = await group("PARENT", 2);
    const otherParent = await account("otherparent");
    expect((await getGroupView(groupId)).payerChoices).toEqual([]);
    await adminLinkParent(admin.id, otherParent.id, people[1].email, "parent");
    expect((await getGroupView(groupId)).payerChoices.map((c) => c.id)).toEqual([otherParent.id]);
    await changeGroupPayer(admin.id, groupId, otherParent.id);
    expect((await prisma.familyPlanGroup.findUniqueOrThrow({ where: { id: groupId } })).payerId).toBe(otherParent.id);
  });
});

describe("corrections", () => {
  it("corrects an approved payment's amount and day, and refuses others", async () => {
    const admin = await account("admin", "ADMIN");
    const student = await account("student");
    const paid = await prisma.zellePayment.create({ data: { userId: student.id, purpose: "CLASS_CREDITS", amountCents: 5000, zelleHandle: "x", status: "VERIFIED", reviewedAt: new Date("2026-09-01T15:00:00Z") } });
    await editRecordedPayment(admin.id, paid.id, { amountCents: 4999, paidOn: "2026-08-30" });
    const after = await prisma.zellePayment.findUniqueOrThrow({ where: { id: paid.id } });
    expect(after.amountCents).toBe(4999);
    expect(after.reviewedAt?.toISOString()).toBe("2026-08-30T17:00:00.000Z");
    await expect(editRecordedPayment(admin.id, paid.id, { amountCents: 4999, paidOn: "2026-08-30" })).rejects.toThrow(/Nothing changed/);
    await expect(editRecordedPayment(admin.id, paid.id, { amountCents: 4999, paidOn: "2099-01-01" })).rejects.toThrow(/not happened/);
    await expect(editRecordedPayment(admin.id, paid.id, { amountCents: 4999, paidOn: "2026-02-30" })).rejects.toThrow(/Pick the day/);
    const waiting = await prisma.zellePayment.create({ data: { userId: student.id, purpose: "CLASS_CREDITS", amountCents: 5000, zelleHandle: "x", status: "PENDING_REVIEW" } });
    await expect(editRecordedPayment(admin.id, waiting.id, { amountCents: 100, paidOn: "2026-08-30" })).rejects.toThrow(/Only an approved/);
  });

  it("edits an announcement and the bell entries that still carry the old words", async () => {
    const admin = await account("admin", "ADMIN");
    const a = await prisma.announcement.create({ data: { title: `${tag} Old`, body: "Old body", createdBy: admin.id } });
    announcementIds.push(a.id);
    await prisma.notification.create({ data: { userId: admin.id, type: "ANNOUNCEMENT", title: `${tag} Old`, body: "Old body" } });
    await updateAnnouncement(a.id, `${tag} New`, "New body");
    expect((await prisma.announcement.findUniqueOrThrow({ where: { id: a.id } })).title).toBe(`${tag} New`);
    expect(await prisma.notification.count({ where: { userId: admin.id, type: "ANNOUNCEMENT", title: `${tag} New`, body: "New body" } })).toBe(1);
    await expect(updateAnnouncement(a.id, " ", "x")).rejects.toThrow(/Title/);
  });
});
