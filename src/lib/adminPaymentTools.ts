import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

/**
 * Fixes a payment that was recorded wrong (the amount typed, or the day it arrived). Only the record changes: the classes, credits and
 * plan it paid for stay exactly as they are, so the money figures, the receipt and the next bill agree with the bank again. Every
 * change is audited with the old and new values. The student is not told (a receipt they reopen simply shows the right numbers).
 */
export class PaymentEditError extends Error {}

const usd = (cents: number) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
const etDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(d);

/** "2026-10-12" to noon Eastern that day, or null. Noon keeps the day the same in any US time zone. */
function noonEastern(date: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 17));
  return Number.isNaN(d.getTime()) || etDay(d) !== date ? null : d;
}

export async function editRecordedPayment(adminId: string, paymentId: string, input: { amountCents: number; paidOn: string }): Promise<{ amount: string; paidOn: string }> {
  const payment = await prisma.zellePayment.findUnique({ where: { id: paymentId }, select: { id: true, userId: true, status: true, amountCents: true, reviewedAt: true, updatedAt: true } });
  if (!payment) throw new PaymentEditError("That payment no longer exists.");
  if (payment.status !== "VERIFIED") throw new PaymentEditError("Only an approved payment can be corrected.");
  const { amountCents } = input;
  if (!Number.isInteger(amountCents) || amountCents < 0 || amountCents > 500_000) throw new PaymentEditError("Pick an amount from $0 to $5,000.");
  const paidAt = noonEastern(input.paidOn);
  if (!paidAt) throw new PaymentEditError("Pick the day the money arrived.");
  if (input.paidOn > etDay(new Date())) throw new PaymentEditError("That day has not happened yet.");
  if (paidAt.getTime() < Date.UTC(2024, 0, 1)) throw new PaymentEditError("Pick a day from 2024 on.");

  const oldDay = etDay(payment.reviewedAt ?? payment.updatedAt);
  const sameDay = oldDay === input.paidOn;
  if (amountCents === payment.amountCents && sameDay) throw new PaymentEditError("Nothing changed.");
  await prisma.zellePayment.update({ where: { id: payment.id }, data: { amountCents, ...(sameDay ? {} : { reviewedAt: paidAt }) } });
  const parts = [amountCents !== payment.amountCents ? `amount ${usd(payment.amountCents)} to ${usd(amountCents)}` : null, sameDay ? null : `date ${oldDay} to ${input.paidOn}`].filter(Boolean);
  await logAudit({ actorId: adminId, action: "payment.edit", targetType: "ZellePayment", targetId: payment.id, detail: `Corrected ${parts.join(", ")}` }).catch(() => undefined);
  return { amount: usd(amountCents), paidOn: input.paidOn };
}
