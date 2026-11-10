import { addIgnoredName, isIgnoredSender, normalizeFullName } from "@/lib/ignoredSenders";
import { getTextSetting, saveSetting } from "@/lib/siteSettings";
import { SETTING_BY_KEY } from "@/lib/siteSettingsDefs";
import { prisma } from "@/lib/prisma";
import { approveZellePayment } from "@/lib/payments";
import { logAudit } from "@/lib/audit";
import { unmatchedReceiptWhere } from "@/lib/paymentPipelineStatus";
import { namesMatch, phoneAgrees } from "@/lib/paymentEmail";
import { rankPayments, type Confidence } from "@/lib/paymentScoring";
import { getOrCreateOpenInstallmentPayment } from "@/lib/paymentPlans";
import { describePaymentPlan } from "@/lib/classCreditPricing";
import type { PaymentPlan, ZellePayment } from "@prisma/client";

// Bank and Venmo emails that matched no payment, and what an admin can do
// about them: attach one to a payment, or dismiss it. Every function here
// assumes the caller (the admin actions) has checked for an ADMIN session.

export class ReceiptError extends Error {}

export interface UnmatchedReceipt {
  id: string;
  method: "ZELLE" | "VENMO" | string;
  senderName: string;
  amountCents: number;
  memo: string | null;
  receivedAt: Date;
  /** The last four digits of the phone the email showed for the sender, if it showed one. */
  senderPhoneLast4: string | null;
  /**
   * Open payments for exactly the same amount: the only ones this email may be attached to. `phoneMatch` marks a
   * student whose typed-in number agrees with the email's: a pointer for the admin, never an approval.
   */
  candidates: { id: string; status: string; studentName: string | null; studentEmail: string; createdAt: Date; phoneMatch: boolean; score: number; reasons: string[] }[];
  /** How sure the ranking is about the top candidate: strong (a clear, code-backed lead), likely, or weak. */
  confidence: Confidence;
}

export async function listUnmatchedReceipts(now = new Date()): Promise<UnmatchedReceipt[]> {
  const receipts = await prisma.processedPaymentEmail.findMany({
    where: unmatchedReceiptWhere(now),
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  if (receipts.length === 0) return [];
  const open = await prisma.zellePayment.findMany({
    where: { status: { in: ["AWAITING_TRANSFER", "PENDING_REVIEW"] }, amountCents: { in: receipts.map((r) => r.amountCents) } },
    select: {
      id: true,
      status: true,
      amountCents: true,
      createdAt: true,
      submittedAt: true,
      senderPhone: true,
      user: { select: { name: true, email: true, phone: true, payerAliases: { select: { name: true } } } },
      // A parent-paid or group bill is paid by the family's payer, whose name is the one the bank shows.
      familyGroup: { select: { payer: { select: { name: true, payerAliases: { select: { name: true } } } } } },
      paymentPlan: { select: { familyGroup: { select: { payer: { select: { name: true, payerAliases: { select: { name: true } } } } } } } },
    },
    orderBy: { createdAt: "desc" },
  });
  return receipts.map((r) => {
    const sameAmount = open.filter((p) => p.amountCents === r.amountCents);
    const { ranked, confidence } = rankPayments(
      sameAmount.map((p) => {
        const payer = p.familyGroup?.payer ?? p.paymentPlan?.familyGroup?.payer ?? null;
        return {
          id: p.id,
          status: p.status,
          createdAt: p.createdAt,
          submittedAt: p.submittedAt,
          senderPhone: p.senderPhone,
          phone: p.user.phone,
          payerNames: [p.user.name, ...p.user.payerAliases.map((a) => a.name), ...(payer ? [payer.name, ...payer.payerAliases.map((a) => a.name)] : [])],
          raw: p,
        };
      }),
      { senderName: r.senderName, memo: r.memo, receivedAt: r.createdAt, senderPhoneLast4: r.senderPhone ? r.senderPhone.slice(-4) : r.senderPhoneLast4 },
    );
    return {
      id: r.id,
      method: r.method,
      senderName: r.senderName,
      amountCents: r.amountCents,
      memo: r.memo,
      receivedAt: r.createdAt,
      senderPhoneLast4: r.senderPhone ? r.senderPhone.slice(-4) : r.senderPhoneLast4,
      confidence,
      // Best first: the ranking already counts a matching phone, the code, the name and the timing.
      candidates: ranked.map((c) => ({
        id: c.id,
        status: c.status,
        studentName: c.raw.user.name,
        studentEmail: c.raw.user.email,
        createdAt: c.createdAt,
        phoneMatch: phoneAgrees(c.raw.senderPhone ?? c.raw.user.phone, r),
        score: c.score,
        reasons: c.reasons,
      })),
    };
  });
}

/**
 * Attaches an email to a payment and approves it, as the admin. The amounts
 * must be exactly equal: this is the same money check the automatic matching
 * makes, with a person choosing the student instead of the name matching.
 */
export async function matchReceiptToPayment(input: {
  receiptId: string;
  paymentId: string;
  admin: { id: string; email: string | null };
  /** Added to the activity log line (how the bill was found). */
  note?: string;
}): Promise<void> {
  const { receiptId, paymentId, admin } = input;
  const receipt = await prisma.processedPaymentEmail.findUnique({ where: { id: receiptId } });
  if (!receipt || receipt.paymentId || receipt.dismissedAt) throw new ReceiptError("That email has already been handled.");
  const payment = await prisma.zellePayment.findUnique({
    where: { id: paymentId },
    select: { id: true, userId: true, status: true, amountCents: true, user: { select: { name: true } } },
  });
  if (!payment || (payment.status !== "AWAITING_TRANSFER" && payment.status !== "PENDING_REVIEW")) {
    throw new ReceiptError("That payment is no longer open.");
  }
  if (payment.amountCents !== receipt.amountCents) {
    throw new ReceiptError(amountMismatch(payment.amountCents, receipt.amountCents));
  }

  // Claim the email first so it can never settle two payments.
  const claimed = await prisma.processedPaymentEmail.updateMany({ where: { id: receipt.id, paymentId: null, dismissedAt: null }, data: { paymentId } });
  if (claimed.count !== 1) throw new ReceiptError("That email has already been handled.");

  try {
    await prisma.zellePayment.updateMany({
      where: { id: paymentId, status: "AWAITING_TRANSFER" },
      data: { status: "PENDING_REVIEW", senderName: receipt.senderName, method: receipt.method, submittedAt: new Date() },
    });
    await approveZellePayment(paymentId, admin.id);
    await prisma.zellePayment.update({ where: { id: paymentId }, data: { checkedAt: new Date() } });
  } catch (err) {
    console.error("Matching a payment email failed", err);
    // Give the email back only if the payment was NOT approved: once it is VERIFIED the email is spent.
    const state = await prisma.zellePayment.findUnique({ where: { id: paymentId }, select: { status: true } });
    if (state?.status !== "VERIFIED") {
      await prisma.processedPaymentEmail.updateMany({ where: { id: receipt.id, paymentId }, data: { paymentId: null } });
      throw new ReceiptError("The payment could not be approved. Nothing was changed.");
    }
  }

  // A person has now confirmed this payer pays for this student: remember the name, so next time it clears by itself.
  const learned = await rememberPayerName(payment.userId, payment.user.name, receipt.senderName).catch(() => false);

  await logAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "payment.match_email",
    targetType: "ZellePayment",
    targetId: paymentId,
    detail: `Attached a ${receipt.method} email from ${receipt.senderName} (${(receipt.amountCents / 100).toFixed(2)}) to the payment and approved it${input.note ? ` (${input.note})` : ""}${learned ? `; will accept payments from "${receipt.senderName}" for this student from now on` : ""}`,
  });
}

const usd = (cents: number) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

/** The refusal when an email and a bill differ: both amounts, so the owner sees why at once. */
export function amountMismatch(billCents: number, emailCents: number): string {
  return `Their bill is ${usd(billCents)} and this email is ${usd(emailCents)}, so it cannot be attached. The amounts must be the same.`;
}

const OPEN_STATUSES = ["AWAITING_TRANSFER", "PENDING_REVIEW"] as const;
const isOpen = (status: string) => (OPEN_STATUSES as readonly string[]).includes(status);

/** The plan an email from this person would pay: their own running plan, or a group or parent plan they pay for without one of their own. */
async function planPaidBy(userId: string): Promise<PaymentPlan | null> {
  const own = await prisma.paymentPlan.findFirst({ where: { userId, status: "ACTIVE" }, orderBy: { createdAt: "desc" } });
  if (own) return own;
  return prisma.paymentPlan.findFirst({ where: { status: "ACTIVE", familyGroup: { payerId: userId } }, orderBy: { nextDueDate: "asc" } });
}

/** The bill that is open for this plan right now, as the payer sees it (a group's combined bill, or its combined first payment). Never makes one. */
async function openBillOf(plan: PaymentPlan): Promise<ZellePayment | null> {
  if (plan.familyGroupId && plan.installmentsPaid === 0) {
    return prisma.zellePayment.findFirst({ where: { familyGroupId: plan.familyGroupId, purpose: "FAMILY_PLAN_START", status: { in: [...OPEN_STATUSES] } }, orderBy: { createdAt: "desc" } });
  }
  const own = await prisma.zellePayment.findFirst({ where: { paymentPlanId: plan.id, status: { in: [...OPEN_STATUSES] } }, orderBy: { createdAt: "desc" } });
  if (own?.bundleId) {
    const combined = await prisma.zellePayment.findUnique({ where: { id: own.bundleId } });
    if (combined && isOpen(combined.status)) return combined;
  }
  return own;
}

async function openReceipt(receiptId: string) {
  const receipt = await prisma.processedPaymentEmail.findUnique({ where: { id: receiptId } });
  if (!receipt || receipt.paymentId || receipt.dismissedAt) throw new ReceiptError("That email has already been handled.");
  return receipt;
}

export interface ReceiptStudentTarget {
  userId: string;
  studentName: string;
  /** What the email would pay, e.g. "6 Months, bill 3 of 6". */
  billLabel: string;
  /** The bill's amount; null for a group whose next combined bill is not open yet (its total is known once it opens). */
  amountCents: number | null;
  /** They paid before the bill opened: attaching opens it now. */
  opensEarly: boolean;
}

/**
 * "Find the student" on an unmatched email: what attaching it to this person would pay, without changing anything. Refuses (naming
 * the bill's amount) when the amounts differ, and when the person has no running plan to pay.
 */
export async function previewReceiptForStudent(receiptId: string, userId: string): Promise<ReceiptStudentTarget> {
  const receipt = await openReceipt(receiptId);
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true } });
  if (!user) throw new ReceiptError("That account no longer exists.");
  const studentName = user.name ?? user.email;
  const plan = await planPaidBy(user.id);
  if (!plan) throw new ReceiptError(`${studentName} has no running plan, so there is no bill for this email. Attach it to an open payment instead.`);
  const planLabel = describePaymentPlan(plan.cadence, plan.term);
  const open = await openBillOf(plan);
  let target: ReceiptStudentTarget;
  if (open) {
    const billLabel =
      open.purpose === "FAMILY_PLAN_START" ? "Combined first payment for the group" : open.purpose === "FAMILY_PLAN_INSTALLMENT" ? "Combined 28-day group bill" : `${planLabel}, bill ${open.installmentNumber ?? plan.installmentsPaid + 1} of ${plan.termMonths}`;
    target = { userId: user.id, studentName, billLabel, amountCents: open.amountCents, opensEarly: false };
  } else if (plan.familyGroupId) {
    target = { userId: user.id, studentName, billLabel: "Next combined 28-day group bill", amountCents: null, opensEarly: true };
  } else {
    target = { userId: user.id, studentName, billLabel: `${planLabel}, bill ${plan.installmentsPaid + 1} of ${plan.termMonths}`, amountCents: plan.installmentAmountCents, opensEarly: true };
  }
  if (target.amountCents === 0) throw new ReceiptError(`${studentName}'s plan has nothing to pay right now.`);
  if (target.amountCents !== null && target.amountCents !== receipt.amountCents) throw new ReceiptError(amountMismatch(target.amountCents, receipt.amountCents));
  return target;
}

/**
 * Attaches an unmatched email to this person's bill and approves it. When they paid before the bill opened (the common case: a few
 * days early), the next bill is opened now at the plan's price, as the daily job would on its day, and then paid by the email. The
 * amounts must still be the same; the same checks as attaching to an open payment then apply (matchReceiptToPayment).
 */
export async function attachReceiptToStudent(input: { receiptId: string; userId: string; admin: { id: string; email: string | null } }): Promise<{ paymentId: string; openedEarly: boolean }> {
  const target = await previewReceiptForStudent(input.receiptId, input.userId);
  const receipt = await openReceipt(input.receiptId);
  const plan = await planPaidBy(input.userId);
  if (!plan) throw new ReceiptError("Their plan just changed. Refresh and try again.");
  let bill = await openBillOf(plan);
  let openedEarly = false;
  if (!bill) {
    const zelleHandle = process.env.ZELLE_HANDLE ?? "payments@yourplatform.com";
    // A group's next total is only known once its bills open, so the open bills are noted first: if the amounts then differ, everything
    // this opened is put back exactly as it was, and nothing is left open early.
    const before = await openBillRows(plan);
    // Asked as of the due date, which is always inside the window a bill opens in: one bill, for the next installment, never two.
    const asOf = new Date(Math.max(Date.now(), plan.nextDueDate.getTime()));
    bill = (await getOrCreateOpenInstallmentPayment(plan.id, zelleHandle, asOf)).payment;
    openedEarly = true;
    if (bill && bill.amountCents !== receipt.amountCents) {
      await undoOpenedBills(plan, before);
      throw new ReceiptError(amountMismatch(bill.amountCents, receipt.amountCents));
    }
  }
  if (!bill || !isOpen(bill.status)) throw new ReceiptError(`${target.studentName}'s plan has nothing to pay right now.`);
  await matchReceiptToPayment({ receiptId: input.receiptId, paymentId: bill.id, admin: input.admin, note: openedEarly ? "they paid before the bill opened, so it was opened now" : "found by student" });
  return { paymentId: bill.id, openedEarly };
}

type OpenBillRow = { id: string; status: ZellePayment["status"]; amountCents: number; bundleId: string | null; purpose: ZellePayment["purpose"]; submittedAt: Date | null };

/** Every open bill this plan's payment could touch: the plan's own, or for a group every member's bill and its combined bill. */
async function openBillRows(plan: PaymentPlan): Promise<OpenBillRow[]> {
  return prisma.zellePayment.findMany({
    where: {
      status: { in: [...OPEN_STATUSES] },
      OR: plan.familyGroupId
        ? [{ paymentPlan: { familyGroupId: plan.familyGroupId } }, { familyGroupId: plan.familyGroupId, purpose: "FAMILY_PLAN_INSTALLMENT" }]
        : [{ paymentPlanId: plan.id }],
    },
    select: { id: true, status: true, amountCents: true, bundleId: true, purpose: true, submittedAt: true },
  });
}

/**
 * Puts a plan's (or group's) bills back exactly as they were before an early open: bills that open made are removed (nothing was sent
 * or paid on them, and nobody was told), and the bills that were already open get back their status, amount and combined bill.
 */
async function undoOpenedBills(plan: PaymentPlan, before: OpenBillRow[]): Promise<void> {
  const beforeIds = new Set(before.map((r) => r.id));
  const made = (await openBillRows(plan)).filter((r) => !beforeIds.has(r.id) && r.submittedAt === null);
  const madeIds = made.map((r) => r.id);
  await prisma.$transaction(async (tx) => {
    if (madeIds.length > 0) await tx.zellePayment.updateMany({ where: { bundleId: { in: madeIds } }, data: { bundleId: null } });
    for (const r of before) await tx.zellePayment.update({ where: { id: r.id }, data: { status: r.status, amountCents: r.amountCents, bundleId: r.bundleId } });
    const members = made.filter((r) => r.purpose !== "FAMILY_PLAN_INSTALLMENT").map((r) => r.id);
    const combined = made.filter((r) => r.purpose === "FAMILY_PLAN_INSTALLMENT").map((r) => r.id);
    if (members.length > 0) await tx.zellePayment.deleteMany({ where: { id: { in: members }, submittedAt: null } });
    if (combined.length > 0) await tx.zellePayment.deleteMany({ where: { id: { in: combined }, submittedAt: null } });
  });
}

/** Marks an email as having nothing to do with a payment, so it stops being counted. */
export async function dismissReceipt(input: { receiptId: string; admin: { id: string; email: string | null } }): Promise<void> {
  const { receiptId, admin } = input;
  const updated = await prisma.processedPaymentEmail.updateMany({
    where: { id: receiptId, paymentId: null, dismissedAt: null },
    data: { dismissedAt: new Date() },
  });
  if (updated.count !== 1) return;
  await logAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "payment.dismiss_email",
    targetType: "ProcessedPaymentEmail",
    targetId: receiptId,
    detail: "Dismissed a payment email that matched no payment",
  });
}

/**
 * "Always ignore this sender": adds the sender's full name to the owner's ignore list (Settings > Payments) and dismisses every
 * email already waiting from that exact name. For the owner's own transfers between their accounts. Never touches a payment.
 */
export async function ignoreSenderFromReceipt(input: { receiptId: string; admin: { id: string; email: string | null } }): Promise<{ name: string; dismissed: number }> {
  const receipt = await prisma.processedPaymentEmail.findUnique({ where: { id: input.receiptId } });
  if (!receipt) throw new ReceiptError("That email no longer exists.");
  const name = receipt.senderName;
  if (normalizeFullName(name).split(" ").length < 2) throw new ReceiptError("A single name is too loose to ignore. Use Not a studio payment for this one.");

  const current = await getTextSetting("payments.ignoreSenderNames");
  const max = (SETTING_BY_KEY["payments.ignoreSenderNames"] as { maxLength: number }).maxLength;
  const next = addIgnoredName(current, name, max);
  if (next === current && !isIgnoredSender(name, current)) throw new ReceiptError("The ignore list is full. Remove a name in Settings first.");
  if (next !== current) await saveSetting("payments.ignoreSenderNames", next);

  const waiting = await prisma.processedPaymentEmail.findMany({ where: { paymentId: null, dismissedAt: null }, select: { id: true, senderName: true } });
  const ids = waiting.filter((r) => normalizeFullName(r.senderName) === normalizeFullName(name)).map((r) => r.id);
  const dismissed = ids.length ? (await prisma.processedPaymentEmail.updateMany({ where: { id: { in: ids }, paymentId: null, dismissedAt: null }, data: { dismissedAt: new Date() } })).count : 0;
  await logAudit({
    actorId: input.admin.id,
    actorEmail: input.admin.email,
    action: "payment.ignore_sender",
    targetType: "ProcessedPaymentEmail",
    targetId: input.receiptId,
    detail: `Will ignore bank emails from "${name}" from now on; dismissed ${dismissed} waiting`,
  });
  return { name, dismissed };
}

const MAX_ALIASES_PER_STUDENT = 5;

/**
 * Saves the name an email came from as another name this student's payments arrive under.
 * Skipped when it is just their own name, when it is a single word (too loose to trust), or
 * when the student already has several. Only ever called from an admin's confirmed match.
 */
export async function rememberPayerName(userId: string, accountName: string | null, senderName: string): Promise<boolean> {
  const name = senderName.trim().replace(/\s+/g, " ").slice(0, 120);
  if (name.split(" ").length < 2) return false;
  if (namesMatch(accountName, name)) return false;
  const existing = await prisma.payerAlias.findMany({ where: { userId }, select: { name: true } });
  if (existing.some((alias) => namesMatch(alias.name, name))) return false;
  if (existing.length >= MAX_ALIASES_PER_STUDENT) return false;
  await prisma.payerAlias.create({ data: { userId, name } });
  return true;
}

/** Forgets one saved payer name (an admin removing a mistake). */
export async function forgetPayerName(input: { aliasId: string; admin: { id: string; email: string | null } }): Promise<void> {
  const alias = await prisma.payerAlias.findUnique({ where: { id: input.aliasId }, select: { id: true, userId: true, name: true } });
  if (!alias) return;
  await prisma.payerAlias.delete({ where: { id: alias.id } });
  await logAudit({
    actorId: input.admin.id,
    actorEmail: input.admin.email,
    action: "payment.forget_payer_name",
    targetType: "User",
    targetId: alias.userId,
    detail: `Stopped accepting payments from "${alias.name}" for this student automatically`,
  });
}
