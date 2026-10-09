import { prisma } from "@/lib/prisma";
import { assessPhone } from "@/lib/phoneValidity";
import { getBoolSetting } from "@/lib/siteSettings";
import { isPhoneConflict, isPhoneTaken, PHONE_TAKEN } from "@/lib/phoneVerification";

// The number a student pays from is tied to their account's own number, so nobody can type an enrolled student's
// number at payment time to borrow their identity: it must equal the number saved on the paying account, and
// that number is unique to the account (one number, one account) and checked to be real when it was saved.

export interface PaymentPhoneState {
  /** Whether the payment sheet should ask for a number at all (owner setting). */
  ask: boolean;
  /** The number already stored for this payment, if any. */
  paymentPhone: string | null;
  /** True when the account already has a number on file, so the sheet only asks to confirm it. */
  hasAccountPhone: boolean;
  /** The last four digits of the account's number, as a hint. The whole number is never sent to the sheet. */
  accountPhoneLast4: string | null;
}

/** What the payment sheet needs to know before it shows the code. Only the payment's own owner can read it. */
export async function getPaymentPhoneState(userId: string, paymentId: string): Promise<PaymentPhoneState | null> {
  const payment = await prisma.zellePayment.findFirst({
    where: { id: paymentId, userId },
    select: { senderPhone: true, user: { select: { phone: true } } },
  });
  if (!payment) return null;
  return {
    ask: await getBoolSetting("payments.askPhone"),
    paymentPhone: payment.senderPhone,
    hasAccountPhone: Boolean(payment.user.phone),
    accountPhoneLast4: payment.user.phone ? payment.user.phone.slice(-4) : null,
  };
}

export type PaymentPhoneCheck =
  | { status: "match" } // the typed number is the one on the account
  | { status: "free" } // the account has none yet and this one is real and not taken
  | { status: "mismatch" } // the account has a different number
  | { status: "taken" } // another account already has this number
  | { status: "invalid"; error: string }; // not a real number (a typo, usually)

/** Live check behind the green check mark. Reads only the signed-in person's own account. */
export async function checkPaymentPhone(userId: string, rawPhone: string): Promise<PaymentPhoneCheck> {
  const assessed = assessPhone(rawPhone);
  if (!assessed.ok) return { status: "invalid", error: assessed.error };
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { phone: true } });
  if (!user) return { status: "invalid", error: "Account not found." };
  if (user.phone) return user.phone === assessed.phone ? { status: "match" } : { status: "mismatch" };
  return (await isPhoneTaken(assessed.phone, userId)) ? { status: "taken" } : { status: "free" };
}

export const PHONE_MISMATCH = "That isn't the phone number on your account. Type the number saved on your account, or change it in Settings, then Account.";

/**
 * Stores the number a student pays from, on that payment. It must be the number on their account (or, if the
 * account has none yet, a real number nobody else has, which is then saved to the account too). Typed numbers
 * are still not proof, so on its own it can settle a payment only when a bank email shows the same whole number,
 * and such a payment is left in the owner's "unchecked" list (see paymentEmail.ts).
 */
export async function savePaymentPhone(userId: string, paymentId: string, rawPhone: string): Promise<{ ok: true; phone: string } | { ok: false; error: string }> {
  const checked = await checkPaymentPhone(userId, rawPhone);
  if (checked.status === "invalid") return { ok: false, error: checked.error };
  if (checked.status === "mismatch") return { ok: false, error: PHONE_MISMATCH };
  if (checked.status === "taken") return { ok: false, error: PHONE_TAKEN };

  const assessed = assessPhone(rawPhone);
  if (!assessed.ok) return assessed; // unreachable after the check above, but keeps the types honest
  const payment = await prisma.zellePayment.findFirst({
    where: { id: paymentId, userId, status: { in: ["AWAITING_TRANSFER", "PENDING_REVIEW"] } },
    select: { id: true },
  });
  if (!payment) return { ok: false, error: "This payment is no longer open." };

  if (checked.status === "free") {
    try {
      await prisma.user.update({ where: { id: userId }, data: { phone: assessed.phone, phoneVerifiedAt: null } });
    } catch (err) {
      if (isPhoneConflict(err)) return { ok: false, error: PHONE_TAKEN };
      throw err;
    }
  }
  await prisma.zellePayment.update({ where: { id: payment.id }, data: { senderPhone: assessed.phone } });
  return { ok: true, phone: assessed.phone };
}
