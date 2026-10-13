import { prisma } from "@/lib/prisma";
import { notifyAdmins } from "@/lib/adminNotifications";

/**
 * Venmo can take money back after the fact (a cancelled or reversed payment, a refund the sender asked for, a
 * dispute). Venmo's wording for these has not been seen yet, so this reads defensively: a Venmo email whose
 * subject says the money went back, with a dollar amount. It never changes a payment by itself; it tells the
 * admins which approved payment it probably is, so they use Refund and take the access back.
 */
const REVERSAL_WORDS = /\b(refund(?:ed)?|revers(?:ed|al)|cancel(?:l)?ed|returned|charge ?back|dispute[d]?|removed|failed|declined)\b/i;
const NORMAL_RECEIPT = /\bpaid you\b|\bcharged you\b/i;

export interface ParsedReversal {
  amountCents: number;
  /** Everything the subject said, kept short for the alert. */
  subject: string;
}

export function parseReversal(from: string, subject: string, body: string): ParsedReversal | null {
  if (!/venmo\.com/i.test(from)) return null;
  if (!REVERSAL_WORDS.test(subject) || NORMAL_RECEIPT.test(subject)) return null;
  const amount = `${subject}\n${body}`.match(/\$\s?([\d,]+(?:\.\d{2})?)/);
  if (!amount) return null;
  const cents = Math.round(Number(amount[1].replace(/,/g, "")) * 100);
  if (!Number.isFinite(cents) || cents <= 0) return null;
  return { amountCents: cents, subject: subject.replace(/\s+/g, " ").trim().slice(0, 140) };
}

/** Tells the admins about a probable reversal, once per email. Never throws. */
export async function reportReversal(input: { messageId: string; from: string; subject: string; body: string }): Promise<boolean> {
  const parsed = parseReversal(input.from, input.subject, input.body);
  if (!parsed) return false;
  try {
    const key = `payment-reversal:${input.messageId.slice(0, 160)}`;
    try {
      await prisma.appSetting.create({ data: { key, value: String(Date.now()) } });
    } catch (err) {
      if ((err as { code?: string })?.code === "P2002") return true; // already reported
      throw err;
    }
    await prisma.appSetting.deleteMany({ where: { key: { startsWith: "payment-reversal:" }, updatedAt: { lt: new Date(Date.now() - 90 * 24 * 3600 * 1000) } } });

    const since = new Date(Date.now() - 120 * 24 * 3600 * 1000);
    const candidates = await prisma.zellePayment.findMany({
      where: { status: "VERIFIED", amountCents: parsed.amountCents, reviewedAt: { gte: since } },
      select: { id: true, user: { select: { id: true, name: true, email: true } } },
      take: 10,
    });
    const text = `${input.subject}\n${input.body}`;
    const named = candidates.filter((c) => c.user.name && text.toLowerCase().includes(c.user.name.toLowerCase()));
    const likely = named.length > 0 ? named : candidates;
    const who = likely.length === 0 ? "No approved payment of that exact amount was found in the last 4 months." : `Possible payment${likely.length === 1 ? "" : "s"}: ${likely.map((c) => c.user.name ?? c.user.email).join(", ")}${named.length === 0 && likely.length > 1 ? " (not narrowed by name)" : ""}.`;
    await notifyAdmins("PAYMENT_REVERSED", {
      type: "ADMIN_ALERT",
      title: `Venmo may have taken back $${(parsed.amountCents / 100).toFixed(2)}`,
      body: `Venmo email: "${parsed.subject}". ${who} Nothing was changed. If the money really went back, open the payment in Admin > Payments and use Refund to remove the student's access.`,
      cta: { label: "Open payments", path: "/admin/payments" },
    });
    return true;
  } catch (err) {
    console.error("Payment reversal report failed (non-blocking):", err);
    return false;
  }
}
