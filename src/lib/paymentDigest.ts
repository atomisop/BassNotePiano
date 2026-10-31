import { prisma } from "@/lib/prisma";
import { rankPayments } from "@/lib/paymentScoring";
import { unmatchedReceiptWhere } from "@/lib/paymentPipelineStatus";

export interface PaymentDigestFacts {
  /** Payments the payer says they sent that have waited for you more than a day. */
  waitingOverDay: number;
  /** Unmatched bank emails whose best open payment is a strong or likely match: one tap each in Admin > Payments > Unmatched emails. */
  likelyMatches: number;
}

/**
 * The two payment facts the morning email adds: money that has been sitting unapproved for more than a day, and emails that already have a
 * likely owner (see paymentScoring.ts) so clearing them is one tap each. Plain queries only: this runs in a scheduled function.
 */
export async function getPaymentDigestFacts(now = new Date()): Promise<PaymentDigestFacts> {
  const waitingOverDay = await prisma.zellePayment.count({ where: { status: "PENDING_REVIEW", submittedAt: { lt: new Date(now.getTime() - 24 * 3_600_000) } } });
  const receipts = await prisma.processedPaymentEmail.findMany({ where: unmatchedReceiptWhere(now), orderBy: { createdAt: "desc" }, take: 50 });
  if (receipts.length === 0) return { waitingOverDay, likelyMatches: 0 };
  const open = await prisma.zellePayment.findMany({
    where: { status: { in: ["AWAITING_TRANSFER", "PENDING_REVIEW"] }, amountCents: { in: receipts.map((r) => r.amountCents) } },
    select: {
      id: true,
      status: true,
      amountCents: true,
      createdAt: true,
      submittedAt: true,
      senderPhone: true,
      user: { select: { name: true, phone: true, payerAliases: { select: { name: true } } } },
      familyGroup: { select: { payer: { select: { name: true, payerAliases: { select: { name: true } } } } } },
      paymentPlan: { select: { familyGroup: { select: { payer: { select: { name: true, payerAliases: { select: { name: true } } } } } } } },
    },
  });
  let likelyMatches = 0;
  for (const r of receipts) {
    const candidates = open
      .filter((p) => p.amountCents === r.amountCents)
      .map((p) => {
        const payer = p.familyGroup?.payer ?? p.paymentPlan?.familyGroup?.payer ?? null;
        return {
          id: p.id,
          status: p.status,
          createdAt: p.createdAt,
          submittedAt: p.submittedAt,
          senderPhone: p.senderPhone,
          phone: p.user.phone,
          payerNames: [p.user.name, ...p.user.payerAliases.map((a) => a.name), ...(payer ? [payer.name, ...payer.payerAliases.map((a) => a.name)] : [])],
        };
      });
    const { confidence } = rankPayments(candidates, { senderName: r.senderName, memo: r.memo, receivedAt: r.createdAt, senderPhoneLast4: r.senderPhone ? r.senderPhone.slice(-4) : r.senderPhoneLast4 });
    if (confidence !== "weak") likelyMatches++;
  }
  return { waitingOverDay, likelyMatches };
}
