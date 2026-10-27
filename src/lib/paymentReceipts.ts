import { addIgnoredName, isIgnoredSender, normalizeFullName } from "@/lib/ignoredSenders";
import { getTextSetting, saveSetting } from "@/lib/siteSettings";
import { SETTING_BY_KEY } from "@/lib/siteSettingsDefs";
import { prisma } from "@/lib/prisma";
import { approveZellePayment } from "@/lib/payments";
import { logAudit } from "@/lib/audit";
import { unmatchedReceiptWhere } from "@/lib/paymentPipelineStatus";
import { namesMatch, phoneAgrees } from "@/lib/paymentEmail";
import { rankPayments, type Confidence } from "@/lib/paymentScoring";

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
    throw new ReceiptError("The amounts are different, so this email cannot be attached to that payment.");
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
    detail: `Attached a ${receipt.method} email from ${receipt.senderName} (${(receipt.amountCents / 100).toFixed(2)}) to the payment and approved it${learned ? `; will accept payments from "${receipt.senderName}" for this student from now on` : ""}`,
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
