import { prisma } from "@/lib/prisma";
import { approveZellePayment } from "@/lib/payments";
import { sendPaymentReceipt } from "@/lib/paymentReceipt";
import { reportError } from "@/lib/reportError";

/**
 * One bill a cycle for a group (family plan or parent mode) instead of one per person. Each member still has their own 28-day bill row,
 * because that row carries their credits and their plan's progress, but while two or more of them are open they are held inside ONE
 * combined bill (purpose FAMILY_PLAN_INSTALLMENT, owned by the group's payer, `bundleId` on each member row). The payer pays and
 * submits that one bill, a bank email is matched to it by the payer's name and the total, and approving it approves every member bill it
 * holds and sends ONE receipt. A person on a plan of their own, or a group down to one open bill, keeps an ordinary bill.
 */

/** Builds, refreshes or dissolves the group's combined bill from the members' open bills. Safe to call as often as you like. */
export async function syncGroupBundle(groupId: string, zelleHandle: string): Promise<{ bundleId: string | null }> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`select pg_advisory_xact_lock(hashtext(${"bundle:" + groupId}))`;
    const group = await tx.familyPlanGroup.findUnique({ where: { id: groupId }, select: { id: true, payerId: true } });
    if (!group) return { bundleId: null };
    const rows = await tx.zellePayment.findMany({
      where: {
        purpose: "PAYMENT_PLAN_INSTALLMENT",
        status: "AWAITING_TRANSFER",
        submittedAt: null,
        // Not a bill already held in a combined bill that was sent, is being reviewed, or was rejected.
        OR: [{ bundleId: null }, { bundle: { status: "AWAITING_TRANSFER" } }],
        paymentPlan: { familyGroupId: groupId, status: "ACTIVE", installmentsPaid: { gt: 0 } },
      },
      select: { id: true, amountCents: true, bundleId: true },
    });
    const existing = await tx.zellePayment.findFirst({
      where: { purpose: "FAMILY_PLAN_INSTALLMENT", familyGroupId: groupId, status: "AWAITING_TRANSFER", submittedAt: null },
      orderBy: { createdAt: "desc" },
    });
    if (rows.length < 2) {
      if (existing) {
        await tx.zellePayment.updateMany({ where: { bundleId: existing.id }, data: { bundleId: null } });
        await tx.zellePayment.update({ where: { id: existing.id }, data: { status: "EXPIRED" } });
      }
      return { bundleId: null };
    }
    const total = rows.reduce((sum, r) => sum + r.amountCents, 0);
    let bundleId: string;
    if (existing) {
      bundleId = existing.id;
      if (existing.amountCents !== total) await tx.zellePayment.update({ where: { id: existing.id }, data: { amountCents: total } });
    } else {
      const created = await tx.zellePayment.create({
        data: { userId: group.payerId, purpose: "FAMILY_PLAN_INSTALLMENT", amountCents: total, zelleHandle, familyGroupId: groupId, status: "AWAITING_TRANSFER" },
      });
      bundleId = created.id;
    }
    await tx.zellePayment.updateMany({ where: { bundleId, id: { notIn: rows.map((r) => r.id) } }, data: { bundleId: null } });
    await tx.zellePayment.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { bundleId } });
    return { bundleId };
  });
}

/** The bundle a member's open bill sits in, if any (the bundle is what the payer sees and pays). */
export async function bundleOf(paymentId: string) {
  const row = await prisma.zellePayment.findUnique({ where: { id: paymentId }, select: { bundle: true } });
  return row?.bundle ?? null;
}

/**
 * Approves a combined bill: every member bill it holds is approved (credits and plan progress, exactly as an ordinary bill), then the
 * combined bill itself is marked paid and ONE receipt goes to the payer. Refuses when the members' bills no longer add up to the amount
 * that was asked for (someone left or changed after the bill was made): reject it and let the payer pay the new total.
 */
export async function approveBundlePayment(bundleId: string, reviewerId: string | null, opts?: { auto?: boolean }): Promise<void> {
  const bundle = await prisma.zellePayment.findUniqueOrThrow({ where: { id: bundleId }, include: { bundled: true } });
  if (bundle.purpose !== "FAMILY_PLAN_INSTALLMENT") throw new Error("That is not a combined bill.");
  if (bundle.status !== "PENDING_REVIEW") throw new Error(`Payment ${bundleId} is not pending review (status: ${bundle.status})`);
  const members = bundle.bundled.filter((m) => m.status === "AWAITING_TRANSFER" || m.status === "PENDING_REVIEW" || m.status === "VERIFIED");
  const sum = members.reduce((n, m) => n + m.amountCents, 0);
  if (members.length === 0 || sum !== bundle.amountCents) {
    throw new Error("The members' bills no longer add up to this combined bill. Reject it and let the payer pay the new total.");
  }
  for (const m of members) {
    if (m.status === "VERIFIED") continue;
    if (m.status === "AWAITING_TRANSFER") {
      await prisma.zellePayment.updateMany({ where: { id: m.id, status: "AWAITING_TRANSFER" }, data: { status: "PENDING_REVIEW", submittedAt: bundle.submittedAt ?? new Date(), method: bundle.method } });
    }
    await approveZellePayment(m.id, reviewerId, { ...opts, skipReceipt: true });
  }
  await prisma.zellePayment.update({
    where: { id: bundleId },
    data: { status: "VERIFIED", reviewedAt: new Date(), reviewedById: reviewerId, autoApproved: opts?.auto === true },
  });
  await sendPaymentReceipt(bundleId).catch((err) => reportError(err, `sendPaymentReceipt ${bundleId}`));
}
