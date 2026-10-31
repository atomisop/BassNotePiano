import { afterAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerSession: async () => null, getServerAuthSession: async () => null, authOptions: {} }));
import { canonicalEmail } from "@/lib/canonicalEmail";
import { OFFERED_PLAN_CADENCE } from "@/lib/classCreditPricing";
import { cancelPaymentPlanBySelf, createParentPlans, PaymentPlanError } from "@/lib/paymentPlans";
import { approveZellePayment, submitZellePaymentReference } from "@/lib/payments";
import { endParentLink, respondToParentLink, sendParentLink } from "@/lib/parentLinks";
import { cancelParentLinkByEmail } from "@/lib/parentLinks";
import { resetRateLimitBackend } from "@/lib/rateLimit";
import { newTag, prisma } from "./helpers";

const tag = newTag("pa");
const userIds: string[] = [];
const slotIds: string[] = [];
async function account(label: string, name: string) {
  const email = `${tag}-${label}@example.test`;
  const u = await prisma.user.create({ data: { email, name, passwordHash: "x", emailCanonical: canonicalEmail(email) } });
  userIds.push(u.id);
  return u;
}
async function linked(label: string) {
  const parent = await account(`p${label}`, "Parent Tester");
  const child = await account(`c${label}`, "Kiddo Tester");
  await sendParentLink(parent.id, child.email);
  const link = await prisma.parentLink.findFirstOrThrow({ where: { parentId: parent.id, childId: child.id } });
  await respondToParentLink(child.id, link.id, true);
  return { parent, child };
}

afterAll(async () => {
  await prisma.parentLink.deleteMany({ where: { OR: [{ parentId: { in: userIds } }, { childId: { in: userIds } }] } });
  await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.mailMessage.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.creditGrant.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.classBooking.deleteMany({ where: { studentId: { in: userIds } } });
  await prisma.zellePayment.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { familyGroup: { payerId: { in: userIds } } }] } });
  await prisma.paymentPlan.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.familyPlanGroup.deleteMany({ where: { payerId: { in: userIds } } });
  await prisma.classSchedule.deleteMany({ where: { id: { in: slotIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
});

describe("abusing the link request", () => {
  it("cannot be used to list which emails have accounts: lookups are rate limited before they answer", async () => {
    resetRateLimitBackend();
    const parent = await account("enum", "Parent Tester");
    let refused = 0;
    for (let i = 0; i < 40; i++) {
      await sendParentLink(parent.id, `ghost${i}-${tag}@example.test`).catch((e: Error) => {
        if (/Too many/i.test(e.message)) refused++;
      });
    }
    expect(refused).toBeGreaterThan(0);
  });

  it("cannot spam one account by withdrawing and asking again", async () => {
    resetRateLimitBackend();
    const parent = await account("spam", "Parent Tester");
    const child = await account("spamc", "Kiddo Tester");
    let sent = 0;
    for (let i = 0; i < 6; i++) {
      const state = await sendParentLink(parent.id, child.email).catch(() => null);
      if (state === "PENDING") sent++;
      await cancelParentLinkByEmail(parent.id, child.email);
    }
    expect(await prisma.notification.count({ where: { userId: child.id, type: "PARENT_LINK_REQUEST" } })).toBeLessThanOrEqual(3);
    expect(sent).toBeLessThanOrEqual(3);
  });

  it("a child who ends a link is not asked again straight away", async () => {
    resetRateLimitBackend();
    const { parent, child } = await linked("end");
    await endParentLink(child.id, parent.id);
    expect(await sendParentLink(parent.id, child.email)).toBe("DECLINED");
  });
});

describe("abusing a plan a parent pays for", () => {
  async function paidPlan(label: string) {
    resetRateLimitBackend();
    const { parent, child } = await linked(label);
    const slot = await prisma.classSchedule.create({ data: { dayOfWeek: 3, startTime: "10:00", durationMin: 45, creditCost: 2, label: `${tag} ${label}` } });
    slotIds.push(slot.id);
    const { startPayment } = await createParentPlans({ payerId: parent.id, cadence: OFFERED_PLAN_CADENCE, term: "TERM_3", zelleHandle: "pay@example.com", children: [{ email: child.email, scheduleId: slot.id, chunkIndex: 0 }], includeSelf: false });
    await submitZellePaymentReference(parent.id, startPayment.id, { senderName: "Parent Tester" });
    await approveZellePayment(startPayment.id, null);
    return { parent, child };
  }

  it("the child cannot cancel the plan their parent pays for; the parent can", async () => {
    const { parent, child } = await paidPlan("cx");
    await expect(cancelPaymentPlanBySelf(child.id, "OTHER", "changed my mind")).rejects.toBeInstanceOf(PaymentPlanError);
    expect((await prisma.paymentPlan.findFirstOrThrow({ where: { userId: child.id } })).status).toBe("ACTIVE");
    await cancelPaymentPlanBySelf(child.id, "OTHER", "Ended by the parent", { byParentId: parent.id });
    expect((await prisma.paymentPlan.findFirstOrThrow({ where: { userId: child.id } })).status).toBe("CANCELED");
  });

  it("another parent cannot end it by naming themselves", async () => {
    const { child } = await paidPlan("cy");
    const stranger = await account("str", "Other Parent");
    await expect(cancelPaymentPlanBySelf(child.id, "OTHER", "x", { byParentId: stranger.id })).rejects.toBeInstanceOf(PaymentPlanError);
  });
});
