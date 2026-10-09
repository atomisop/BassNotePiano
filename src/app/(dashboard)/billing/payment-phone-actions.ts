"use server";

import { getServerAuthSession } from "@/lib/auth";
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
