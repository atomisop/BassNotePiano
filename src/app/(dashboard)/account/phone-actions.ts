"use server";

import { revalidatePath } from "next/cache";
import { getServerAuthSession } from "@/lib/auth";
import { confirmPhoneVerification, removePhone, resendPhoneCode, savePhone, startPhoneVerification, type PhoneResult } from "@/lib/phoneVerification";

// Every action reads the user from the session, never from what the browser sends.
async function userId(): Promise<string | null> {
  const session = await getServerAuthSession();
  return session?.user?.id ?? null;
}
const SIGN_IN = { ok: false as const, error: "Please sign in again." };

/** Keeps a typed number as-is (no text), after checking it looks real. Used while text confirmation is off. */
export async function savePhoneAction(rawPhone: string): Promise<PhoneResult<{ phone: string }>> {
  const id = await userId();
  if (!id) return SIGN_IN;
  const result = await savePhone(id, rawPhone);
  if (result.ok) revalidatePath("/", "layout"); // the phone banner and the payment sheet read the number too
  return result;
}

export async function startPhoneAction(rawPhone: string): Promise<PhoneResult<{ phone: string }>> {
  const id = await userId();
  return id ? startPhoneVerification(id, rawPhone) : SIGN_IN;
}

export async function resendPhoneCodeAction(): Promise<PhoneResult> {
  const id = await userId();
  return id ? resendPhoneCode(id) : SIGN_IN;
}

export async function confirmPhoneAction(code: string): Promise<PhoneResult<{ phone: string }>> {
  const id = await userId();
  if (!id) return SIGN_IN;
  const result = await confirmPhoneVerification(id, code);
  if (result.ok) revalidatePath("/", "layout"); // the phone banner and the payment sheet read the number too
  return result;
}

export async function removePhoneAction(): Promise<PhoneResult> {
  const id = await userId();
  if (!id) return SIGN_IN;
  const result = await removePhone(id);
  if (result.ok) revalidatePath("/", "layout"); // the phone banner and the payment sheet read the number too
  return result;
}
