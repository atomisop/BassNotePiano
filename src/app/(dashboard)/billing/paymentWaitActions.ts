"use server";

import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOwnPaymentWaitInfo } from "@/lib/payments";
import { assertRateLimit, RateLimitError } from "@/lib/rateLimit";
import { AssistantEscalationError, openSubjectSupportCase } from "@/lib/support";

export async function getPaymentWaitInfoAction(paymentId: string): Promise<{ status: string; submittedAt: string | null } | null> {
  const session = await getServerAuthSession();
  if (!session?.user) return null;
  const info = await getOwnPaymentWaitInfo(session.user.id, paymentId);
  return info ? { status: info.status, submittedAt: info.submittedAt ? info.submittedAt.toISOString() : null } : null;
}

/** "Message us about this payment": a support case with the subject Payment, under the student's name. */
export async function askAboutPaymentAction(paymentId: string): Promise<{ ok: true; escalationId: string } | { ok: false; error: string }> {
  const session = await getServerAuthSession();
  if (!session?.user) return { ok: false, error: "Sign in again." };
  try {
    const info = await getOwnPaymentWaitInfo(session.user.id, paymentId);
    if (!info) return { ok: false, error: "That payment doesn't exist." };
    await assertRateLimit(
      prisma.assistantEscalation.count,
      { identifier: `user:${session.user.id}` },
      { windowMinutes: 60, max: 5, message: "You've already reached out. The team will follow up soon." },
    );
    const dollars = (info.amountCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
    const when = info.submittedAt ? ` submitted ${info.submittedAt.toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" })} ET` : "";
    const line = `${dollars} payment${when} (id ${paymentId.slice(-8)})`;
    const { escalationId } = await openSubjectSupportCase(session.user.id, {
      subject: "Payment",
      contextLine: line,
      request: `I'm waiting on my payment: ${line}. Could you check on it?`,
      noticeTitle: (name) => `${name} is asking about a payment`,
      noticeBody: `${line}.`,
    });
    return { ok: true, escalationId };
  } catch (err) {
    if (err instanceof RateLimitError || err instanceof AssistantEscalationError) return { ok: false, error: err.message };
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
