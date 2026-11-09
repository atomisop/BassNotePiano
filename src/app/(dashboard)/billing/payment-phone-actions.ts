"use server";

import { revalidatePath } from "next/cache";
import { getServerAuthSession } from "@/lib/auth";
import { phoneVerifyMode, savePhone } from "@/lib/phoneVerification";
import { checkPaymentPhone, getPaymentPhoneState, savePaymentPhone, type PaymentPhoneCheck, type PaymentPhoneState } from "@/lib/paymentPhone";

// The user always comes from the session; the browser only says which of THEIR payments it means.
export async function getPaymentPhoneStateAction(paymentId: string): Promise<PaymentPhoneState | null> {
  const session = await getServerAuthSession();
  if (!session?.user?.id) return null;
  return getPaymentPhoneState(session.user.id, paymentId);
}

/** Live comparison behind the green check mark. */
export async function checkPaymentPhoneAction(rawPhone: string): Promise<PaymentPhoneCheck> {
  const session = await getServerAuthSession();
  if (!session?.user?.id) return { status: "invalid", error: "Please sign in again." };
  return checkPaymentPhone(session.user.id, rawPhone);
}

export async function savePaymentPhoneAction(paymentId: string, rawPhone: string): Promise<{ ok: true; phone: string } | { ok: false; error: string }> {
  const session = await getServerAuthSession();
  if (!session?.user?.id) return { ok: false, error: "Please sign in again." };
  return savePaymentPhone(session.user.id, paymentId, rawPhone);
}

/**
 * "Use this number on my account", from the payment sheet when the typed number is not the one on the account: saved to the
 * account with the very same checks as Settings > Account (savePhone: a real number, nobody else's, lookups rate limited, the
 * "number changed" email), then on this payment. When numbers are confirmed by text, that has to happen in Settings instead.
 */
export async function saveNumberToAccountAction(paymentId: string, rawPhone: string): Promise<{ ok: true; phone: string } | { ok: false; error: string }> {
  const session = await getServerAuthSession();
  if (!session?.user?.id) return { ok: false, error: "Please sign in again." };
  if (await phoneVerifyMode()) return { ok: false, error: "A new number is confirmed with a text code. Change it in Settings, then Account." };
  const saved = await savePhone(session.user.id, rawPhone);
  if (!saved.ok) return { ok: false, error: saved.error };
  revalidatePath("/", "layout"); // the phone banner and Settings read the number too
  return savePaymentPhone(session.user.id, paymentId, rawPhone);
}
