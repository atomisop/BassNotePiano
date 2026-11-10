import { afterAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerSession: async () => null, getServerAuthSession: async () => null, authOptions: {} }));
import { canonicalEmail } from "@/lib/canonicalEmail";
import { OFFERED_PLAN_CADENCE, calculateFamilyBundleTotal, calculatePaymentPlanRate } from "@/lib/classCreditPricing";
import { cancelPaymentPlan, changeReservedSlot, createParentPlans, getOrCreateOpenInstallmentPayment, PaymentPlanError } from "@/lib/paymentPlans";
import { approveZellePayment, submitZellePaymentReference } from "@/lib/payments";
import { assertParentOf, endParentLink, hasParentControl, listLinksFromParent, listLinksToChild, ParentLinkError, respondToParentLink, sendParentLink } from "@/lib/parentLinks";
import { getChildView, listParentBills } from "@/lib/parentChildren";
import { newTag, prisma } from "./helpers";

const tag = newTag("pm");
const userIds: string[] = [];
const slotIds: string[] = [];

async function account(label: string, name: string) {
  const email = `${tag}-${label}@example.test`;
  const u = await prisma.user.create({ data: { email, name, passwordHash: "x", emailCanonical: canonicalEmail(email) } });
  userIds.push(u.id);
  return u;
}
async function slot(day = 2, time = "11:00") {
  const s = await prisma.classSchedule.create({ data: { dayOfWeek: day, startTime: time, durationMin: 45, creditCost: 2, label: `${tag} ${slotIds.length}` } });
  slotIds.push(s.id);
  return s.id;
}
/** A parent and a child with an accepted link. */
async function linked(childName = "Kiddo Tester") {
  const parent = await account(`p${userIds.length}`, "Parent Tester");
  const child = await account(`c${userIds.length}`, childName);
  const state = await sendParentLink(parent.id, child.email);
  expect(state).toBe("PENDING");
  const link = await prisma.parentLink.findFirstOrThrow({ where: { parentId: parent.id, childId: child.id } });
  await respondToParentLink(child.id, link.id, true);
  return { parent, child };
}
/** Starts a parent plan. `slotIds[i]` is child i's weekly time; with `includeSelf` the next one is the parent's. */
const startPlan = (parentId: string, childEmails: string[], includeSelf: boolean, slotIds: string | string[], term: "MONTHLY" | "TERM_3" = "MONTHLY") => {
  const ids = Array.isArray(slotIds) ? slotIds : [slotIds];
  return createParentPlans({
    payerId: parentId,
    cadence: OFFERED_PLAN_CADENCE,
    term,
    zelleHandle: "pay@example.com",
    children: childEmails.map((email, i) => ({ email, scheduleId: ids[i], chunkIndex: 0 })),
    includeSelf,
    selfSlot: includeSelf ? { scheduleId: ids[childEmails.length], chunkIndex: 0 } : null,
  });
};

afterAll(async () => {
  await prisma.parentLinkInvite.deleteMany({ where: { parentId: { in: userIds } } });
  await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
  await prisma.parentLink.deleteMany({ where: { OR: [{ parentId: { in: userIds } }, { childId: { in: userIds } }] } });
  await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.creditGrant.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.classBooking.deleteMany({ where: { studentId: { in: userIds } } });
  await prisma.zellePayment.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { familyGroup: { payerId: { in: userIds } } }] } });
  await prisma.paymentPlan.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.familyPlanGroup.deleteMany({ where: { payerId: { in: userIds } } });
  await prisma.classSchedule.deleteMany({ where: { id: { in: slotIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
});

describe("linking a child's account", () => {
  it("asks by email, the child says yes, and the parent is told; nothing is shared before that", async () => {
    const parent = await account("lp", "Parent Tester");
    const child = await account("lc", "Kiddo Tester");
    expect(await sendParentLink(parent.id, child.email)).toBe("PENDING");
    expect((await listLinksToChild(child.id)).requests).toHaveLength(1);
    await expect(assertParentOf(parent.id, child.id)).rejects.toBeInstanceOf(ParentLinkError);
    await expect(getChildView(parent.id, child.id)).rejects.toBeInstanceOf(ParentLinkError);
    expect(await prisma.notification.findFirst({ where: { userId: child.id, title: { contains: "parent account wants to link" } } })).toBeTruthy();

    const link = await prisma.parentLink.findFirstOrThrow({ where: { parentId: parent.id, childId: child.id } });
    await respondToParentLink(child.id, link.id, true);
    await expect(assertParentOf(parent.id, child.id)).resolves.toBeUndefined();
    expect((await listLinksFromParent(parent.id))[0]).toMatchObject({ childId: child.id, status: "ACCEPTED" });
    expect(await prisma.notification.findFirst({ where: { userId: parent.id, title: { contains: "account is linked" } } })).toBeTruthy();
    // Only the child's own waiting request can be answered, and only once.
    await expect(respondToParentLink(child.id, link.id, true)).rejects.toThrow(/no longer waiting/);
    const stranger = await account("ls", "Stranger Tester");
    await expect(respondToParentLink(stranger.id, link.id, false)).rejects.toThrow(/no longer waiting/);
  });

  it("uses the same account-exists check: your own and a missing name are refused with a plain reason; no account yet is remembered", async () => {
    const parent = await account("lx", "Parent Tester");
    // No account: answered like any request (the email is kept for when they sign up, see parentInvites.test.ts).
    expect(await sendParentLink(parent.id, `${tag}-nobody-here@example.test`)).toBe("PENDING");
    expect(await prisma.parentLink.count({ where: { parentId: parent.id } })).toBe(0);
    await expect(sendParentLink(parent.id, parent.email)).rejects.toThrow(/your own account/);
    await expect(sendParentLink(parent.id, "nope")).rejects.toThrow(/does not look like an email/);
    const nameless = await prisma.user.create({ data: { email: `${tag}-nn@example.test`, name: "Cher", passwordHash: "x", emailCanonical: canonicalEmail(`${tag}-nn@example.test`) } });
    userIds.push(nameless.id);
    await expect(sendParentLink(parent.id, nameless.email)).rejects.toThrow(/first and last name/);
  });

  it("a declined request is not asked again for a while, and either side can end a link", async () => {
    const parent = await account("ld", "Parent Tester");
    const child = await account("ldc", "Kiddo Tester");
    await sendParentLink(parent.id, child.email);
    const link = await prisma.parentLink.findFirstOrThrow({ where: { parentId: parent.id, childId: child.id } });
    await respondToParentLink(child.id, link.id, false);
    expect(await sendParentLink(parent.id, child.email)).toBe("DECLINED");

    const { parent: p2, child: c2 } = await linked("Second Kid");
    // The child ends it from their side.
    await endParentLink(c2.id, p2.id);
    await expect(assertParentOf(p2.id, c2.id)).rejects.toBeInstanceOf(ParentLinkError);
  });

  it("nobody is both: a child cannot be linked to their own child", async () => {
    const { parent, child } = await linked();
    await expect(sendParentLink(child.id, parent.email)).rejects.toThrow(/the other way round/);
  });
});

describe("a parent paying for a child only", () => {
  it("starts a plan for the child alone at the solo price, with the weekly time on the child, and the parent has no plan", async () => {
    const { parent, child } = await linked();
    const slotId = await slot();
    const { group, plans, startPayment } = await startPlan(parent.id, [child.email], false, slotId);
    expect(group.kind).toBe("PARENT");
    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({ userId: child.id, reservedScheduleId: slotId, familyGroupId: group.id });
    expect(await prisma.paymentPlan.count({ where: { userId: parent.id } })).toBe(0);
    const solo = calculatePaymentPlanRate(OFFERED_PLAN_CADENCE, "MONTHLY").installmentAmountCents;
    expect(startPayment).toMatchObject({ userId: parent.id, purpose: "FAMILY_PLAN_START", amountCents: solo });
  });

  it("refuses a child who is not linked or has not said yes", async () => {
    const parent = await account("nl", "Parent Tester");
    const stranger = await account("nlc", "Kiddo Tester");
    await expect(startPlan(parent.id, [stranger.email], false, await slot())).rejects.toThrow(/not linked to you yet/);
    await sendParentLink(parent.id, stranger.email);
    await expect(startPlan(parent.id, [stranger.email], false, await slot())).rejects.toThrow(/not linked to you yet/);
    expect(await prisma.paymentPlan.count({ where: { userId: { in: [parent.id, stranger.id] } } })).toBe(0);
  });

  it("two children (or a child and the parent) get the group rate; the parent learning too needs no plan of their own yet", async () => {
    const { parent, child } = await linked("Child One");
    const second = await account("two", "Child Two");
    await sendParentLink(parent.id, second.email);
    await respondToParentLink(second.id, (await prisma.parentLink.findFirstOrThrow({ where: { parentId: parent.id, childId: second.id } })).id, true);
    const [a, b] = [await slot(3), await slot(3, "13:00")];
    const two = await startPlan(parent.id, [child.email, second.email], false, [a, b]);
    const each = calculateFamilyBundleTotal(OFFERED_PLAN_CADENCE, "MONTHLY", 2).perStudentMonthlyCents;
    expect(two.startPayment.amountCents).toBe(each * 2);
    // Every child holds their own weekly time.
    expect(Object.fromEntries(two.plans.map((p) => [p.userId, p.reservedScheduleId]))).toEqual({ [child.id]: a, [second.id]: b });

    const { parent: p3, child: c3 } = await linked("Child Three");
    const withSelf = await startPlan(p3.id, [c3.email], true, [await slot(4), await slot(4, "13:00")]);
    expect(withSelf.plans.map((p) => p.userId).sort()).toEqual([p3.id, c3.id].sort());
    expect(withSelf.startPayment.amountCents).toBe(each * 2);
    // The parent learning too has a weekly time of their own as well.
    expect(withSelf.plans.every((p) => p.reservedScheduleId !== null)).toBe(true);
  });

  it("each person needs their own time: two on one time, a parent learning too with no time, or a time another plan holds are refused, and nothing is created", async () => {
    const { parent, child } = await linked("Child Four");
    const second = await account("dup", "Child Five");
    await sendParentLink(parent.id, second.email);
    await respondToParentLink(second.id, (await prisma.parentLink.findFirstOrThrow({ where: { parentId: parent.id, childId: second.id } })).id, true);
    const shared = await slot(5, "15:00");
    await expect(startPlan(parent.id, [child.email, second.email], false, [shared, shared])).rejects.toThrow(/same weekly time/);
    await expect(
      createParentPlans({ payerId: parent.id, cadence: OFFERED_PLAN_CADENCE, term: "MONTHLY", zelleHandle: "pay@example.com", children: [{ email: child.email, scheduleId: shared, chunkIndex: 0 }], includeSelf: true, selfSlot: null }),
    ).rejects.toThrow(/weekly time for yourself/);
    await expect(startPlan(parent.id, [child.email, child.email], false, [shared, await slot(5, "16:00")])).rejects.toThrow(/listed twice/);

    // A time someone else's plan already holds.
    const other = await account("hold", "Holder Tester");
    await prisma.paymentPlan.create({
      data: { userId: other.id, cadence: OFFERED_PLAN_CADENCE, term: "MONTHLY", installmentAmountCents: 5500, creditsPerInstallment: 8, termMonths: 1, installmentsPaid: 1, nextDueDate: new Date(Date.now() + 20 * 86_400_000), reservedScheduleId: shared, reservedChunkIndex: 0 },
    });
    await expect(startPlan(parent.id, [child.email, second.email], false, [await slot(6, "15:00"), shared])).rejects.toThrow(/just taken/);
    expect(await prisma.paymentPlan.count({ where: { userId: { in: [parent.id, child.id, second.id] } } })).toBe(0);
  });

  it("the one first payment books every person's weekly class", async () => {
    const { parent, child } = await linked("Child Six");
    const [a, b] = [await slot(2, "16:00"), await slot(3, "16:00")];
    const { plans, startPayment } = await startPlan(parent.id, [child.email], true, [a, b]);
    await submitZellePaymentReference(parent.id, startPayment.id, { senderName: "Parent Tester" });
    await approveZellePayment(startPayment.id, null);
    for (const plan of plans) {
      const booked = await prisma.classBooking.count({ where: { studentId: plan.userId, scheduleId: plan.reservedScheduleId!, status: "SCHEDULED" } });
      expect(booked).toBeGreaterThan(0);
    }
  });

  it("a parent who already has a plan of their own can still pay for a child, but cannot also add themselves", async () => {
    const { parent, child } = await linked();
    await prisma.paymentPlan.create({
      data: { userId: parent.id, cadence: OFFERED_PLAN_CADENCE, term: "MONTHLY", installmentAmountCents: 5500, creditsPerInstallment: 8, termMonths: 1, installmentsPaid: 1, nextDueDate: new Date(Date.now() + 20 * 86_400_000) },
    });
    await expect(startPlan(parent.id, [child.email], true, [await slot(5), await slot(5, "12:00")])).rejects.toThrow(/already have your own plan/);
    await expect(startPlan(parent.id, [child.email], false, await slot(5))).resolves.toBeDefined();
  });

  it("the first payment starts the child's plan and credits; later 28-day bills are the parent's to pay; the child's plan is untouched if the parent leaves their own", async () => {
    const { parent, child } = await linked();
    const { group, plans, startPayment } = await startPlan(parent.id, [child.email], false, await slot(6), "TERM_3");
    await submitZellePaymentReference(parent.id, startPayment.id, { senderName: "Parent Tester" });
    await approveZellePayment(startPayment.id, null);
    const after = await prisma.paymentPlan.findUniqueOrThrow({ where: { id: plans[0].id } });
    expect(after.installmentsPaid).toBe(1);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: child.id } })).classCredits).toBe(after.creditsPerInstallment);
    expect(await prisma.mailMessage.findFirst({ where: { userId: parent.id, body: { contains: "Parent mode" } } })).toBeTruthy();

    await prisma.paymentPlan.update({ where: { id: after.id }, data: { nextDueDate: new Date() } });
    const { payment } = await getOrCreateOpenInstallmentPayment(after.id, "pay@example.com");
    await expect(submitZellePaymentReference(parent.id, payment!.id, { senderName: "Parent Tester" })).resolves.toBeDefined();
    const bills = await listParentBills(parent.id, "pay@example.com");
    expect(bills.map((b) => b.paymentId)).toContain(payment!.id);
    void group;
  });

  it("a parent who learns too can leave their own plan and the child's plan keeps running", async () => {
    const { parent, child } = await linked();
    const { plans, startPayment } = await startPlan(parent.id, [child.email], true, [await slot(2, "13:00"), await slot(2, "14:00")], "TERM_3");
    await submitZellePaymentReference(parent.id, startPayment.id, { senderName: "Parent Tester" });
    await approveZellePayment(startPayment.id, null);
    const mine = plans.find((p) => p.userId === parent.id)!;
    const kids = plans.find((p) => p.userId === child.id)!;
    await cancelPaymentPlan(mine.id, parent.id, "I only want to pay for my child");
    expect((await prisma.paymentPlan.findUniqueOrThrow({ where: { id: kids.id } })).status).toBe("ACTIVE");
  });
});

describe("the parent working with the child's schedule", () => {
  it("sees the child's progress and practice, and the child's plan weekly time can be moved by the child's plan rules", async () => {
    const { parent, child } = await linked();
    // Days a few days ahead (Eastern), so the move is never refused for a class starting within 6 hours, whatever time the test runs.
    const today = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" })).getDay();
    const oldDay = (today + 3) % 7;
    const newDay = (today + 4) % 7;
    const dayName = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][oldDay];
    const { plans, startPayment } = await startPlan(parent.id, [child.email], false, await slot(oldDay, "15:00"), "TERM_3");
    await submitZellePaymentReference(parent.id, startPayment.id, { senderName: "Parent Tester" });
    await approveZellePayment(startPayment.id, null);
    const view = await getChildView(parent.id, child.id);
    expect(view).toMatchObject({ id: child.id, canMoveWeeklyTime: true });
    expect(view.plan?.weeklyTime).toMatch(new RegExp(dayName));
    expect(view.scales.length).toBeGreaterThan(0);
    expect(view.practice.strip).toHaveLength(30);
    // The weekly time can move (a parent-paid plan is not locked to the teacher the way a group plan is).
    const newSlot = await slot(newDay, "15:00");
    await changeReservedSlot(child.id, newSlot, 0);
    expect((await prisma.paymentPlan.findUniqueOrThrow({ where: { id: plans[0].id } })).reservedScheduleId).toBe(newSlot);
    // Another parent cannot see this child.
    const other = await account("oth", "Other Parent");
    await expect(getChildView(other.id, child.id)).rejects.toBeInstanceOf(ParentLinkError);
  });

  it("a group plan's member still cannot move the weekly time (that stays with the teacher)", async () => {
    const { createFamilyPlans } = await import("@/lib/paymentPlans");
    const payer = await account("gp", "Group Payer");
    const mate = await account("gm", "Group Mate");
    await prisma.familyInvite.create({ data: { payerId: payer.id, inviteeId: mate.id, status: "ACCEPTED" } });
    const slotId = await slot(1, "09:00");
    await createFamilyPlans({ payerId: payer.id, cadence: OFFERED_PLAN_CADENCE, term: "MONTHLY", zelleHandle: "pay@example.com", reservedScheduleId: slotId, reservedChunkIndex: 0, memberEmails: [mate.email] });
    await expect(changeReservedSlot(payer.id, await slot(3, "09:00"), 0)).rejects.toBeInstanceOf(PaymentPlanError);
    await prisma.familyInvite.deleteMany({ where: { payerId: payer.id } });
  });
});

describe("the child's schedule belongs to the parent", () => {
  it("is locked for the child while a parent is linked, and free again once the link ends", async () => {
    const { parent, child } = await linked();
    expect(await hasParentControl(child.id)).toBe(true);
    expect(await hasParentControl(parent.id)).toBe(false);
    await endParentLink(parent.id, child.id);
    expect(await hasParentControl(child.id)).toBe(false);
  });
  it("a waiting request does not lock anything yet", async () => {
    const parent = await account("lk", "Parent Tester");
    const child = await account("lkc", "Kiddo Tester");
    await sendParentLink(parent.id, child.email);
    expect(await hasParentControl(child.id)).toBe(false);
  });
});
