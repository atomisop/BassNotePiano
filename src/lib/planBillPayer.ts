import { prisma } from "@/lib/prisma";

/**
 * Who pays a plan's bill, and which bill they pay. A solo plan's person pays their own bill. On a group or parent plan the group's
 * payer pays (a member, often a child, cannot), and while the member's bill sits inside the group's combined bill (paymentBundles.ts)
 * the payer is asked for that one combined bill, not for the member's part of it. Used by the studio's "Resend bill" and by the
 * follow-up reminder for an overdue bill, so both reach the person who can actually pay.
 */
export interface PlanBillTarget {
  payer: { id: string; email: string; name: string | null; role: "STUDENT" | "ADMIN"; bannedAt: Date | null; notifyEmailPayments: boolean };
  /** The plan's own person. */
  member: { id: string; name: string };
  /** True when the payer is someone other than the plan's own person. */
  paysForSomeoneElse: boolean;
  groupKind: "FAMILY" | "PARENT" | null;
  /** The bill to pay right now: the combined bill when the member's bill is held in one, otherwise the member's own. Null when none is open. */
  bill: {
    id: string;
    amountCents: number;
    zelleHandle: string;
    installmentNumber: number | null;
    /** The group's one combined bill. */
    combined: boolean;
    /** How many people the bill covers (1 for an ordinary bill). */
    people: number;
  } | null;
  /** Where the payer pays: the parent's page for a child's parent plan, Billing > Plans otherwise. */
  payPath: string;
}

const OPEN = ["AWAITING_TRANSFER", "PENDING_REVIEW"] as const;

export async function planBillTarget(planId: string): Promise<PlanBillTarget> {
  const plan = await prisma.paymentPlan.findUniqueOrThrow({
    where: { id: planId },
    select: {
      id: true,
      userId: true,
      user: { select: { id: true, name: true, email: true, role: true, bannedAt: true, notifyEmailPayments: true } },
      familyGroup: { select: { kind: true, payer: { select: { id: true, name: true, email: true, role: true, bannedAt: true, notifyEmailPayments: true } } } },
    },
  });
  const payer = plan.familyGroup?.payer ?? plan.user;
  const paysForSomeoneElse = payer.id !== plan.userId;
  const groupKind = plan.familyGroup?.kind ?? null;

  const own = await prisma.zellePayment.findFirst({
    where: { paymentPlanId: planId, status: { in: [...OPEN] } },
    orderBy: { createdAt: "desc" },
    select: { id: true, amountCents: true, zelleHandle: true, installmentNumber: true, bundle: { select: { id: true, amountCents: true, zelleHandle: true, status: true, _count: { select: { bundled: true } } } } },
  });
  let bill: PlanBillTarget["bill"] = null;
  if (own?.bundle && (OPEN as readonly string[]).includes(own.bundle.status)) {
    bill = { id: own.bundle.id, amountCents: own.bundle.amountCents, zelleHandle: own.bundle.zelleHandle, installmentNumber: null, combined: true, people: own.bundle._count.bundled };
  } else if (own && own.amountCents > 0) {
    // (A $0 bill, a full scholarship, is never a bill to pay or to remind anyone about: it settles by itself, freeBills.ts.)
    bill = { id: own.id, amountCents: own.amountCents, zelleHandle: own.zelleHandle, installmentNumber: own.installmentNumber, combined: false, people: 1 };
  }

  return {
    payer,
    member: { id: plan.user.id, name: plan.user.name ?? plan.user.email },
    paysForSomeoneElse,
    groupKind,
    bill,
    payPath: groupKind === "PARENT" && paysForSomeoneElse ? "/parent" : "/billing/plans",
  };
}
