"use server";

import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit, RateLimitError } from "@/lib/rateLimit";
import { isAssistantConfigured, readImageAsJson } from "@/lib/assistant";
import { judgeReceiptReading, parseReceiptReading, RECEIPT_READ_INSTRUCTION } from "@/lib/receiptScreenshot";

/** The prefix a pre-check line carries, so a later "I've sent it" keeps it (see submitZellePaymentReference). */
export const PRECHECK_PREFIX = "Screenshot check:";

const MAX_BASE64_CHARS = 2_200_000; // about 1.6 MB of image
const TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export type PrecheckResult = { ok: true; matches: boolean; summary: string } | { ok: false; error: string };

/**
 * The payer attaches their bank's confirmation screenshot before "I've sent it". The image is read once, not stored; the outcome is one line
 * saved on the payment so the owner sees "amount, code and date all agree" in the queue. It never approves or changes the status.
 */
export async function precheckReceiptAction(paymentId: string, base64: string, mimeType: string): Promise<PrecheckResult> {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/billing/plans");
  if (!isAssistantConfigured()) return { ok: false, error: "Screenshot checking is not available right now. You can still send it for review." };
  if (!TYPES.has(mimeType) || typeof base64 !== "string" || base64.length < 200 || base64.length > MAX_BASE64_CHARS || /[^A-Za-z0-9+/=]/.test(base64)) {
    return { ok: false, error: "Use a normal screenshot (JPEG, PNG or WebP) under 1.5 MB." };
  }
  const payment = await prisma.zellePayment.findUnique({
    where: { id: paymentId },
    select: { id: true, userId: true, amountCents: true, status: true, paymentPlan: { select: { familyGroup: { select: { payerId: true } } } }, familyGroup: { select: { payerId: true } } },
  });
  // Same people who may submit it: the payment's owner, or the payer of the family or parent-paid plan it belongs to.
  const allowed = payment && (payment.userId === session.user.id || payment.familyGroup?.payerId === session.user.id || payment.paymentPlan?.familyGroup?.payerId === session.user.id);
  if (!payment || !allowed) return { ok: false, error: "That payment was not found." };
  if (payment.status !== "AWAITING_TRANSFER" && payment.status !== "REJECTED") return { ok: false, error: "That payment is already being reviewed." };
  try {
    await consumeRateLimit(prisma, `receipt-precheck:${session.user.id}`, { windowMinutes: 60, max: 6, message: "Too many tries. Please wait a while." });
  } catch (err) {
    if (err instanceof RateLimitError) return { ok: false, error: err.message };
    throw err;
  }
  let reply: string | undefined;
  try {
    reply = await readImageAsJson({ instruction: RECEIPT_READ_INSTRUCTION, mimeType, base64 });
  } catch {
    return { ok: false, error: "Could not read that screenshot right now. You can still send it for review." };
  }
  const verdict = judgeReceiptReading(parseReceiptReading(reply), { id: payment.id, amountCents: payment.amountCents });
  await prisma.zellePayment.update({ where: { id: payment.id }, data: { note: verdict.summary } });
  return { ok: true, matches: verdict.matches, summary: verdict.summary };
}
