"use server";

import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { RateLimitError } from "@/lib/rateLimit";
import { sendRegisterInvite, type RegisterInviteResult } from "@/lib/registerInvite";

/** Emails someone without an account an invitation to create one (family setup and family booking). */
export async function inviteToRegisterAction(email: string): Promise<{ ok: boolean; result: RegisterInviteResult | null; error: string | null }> {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login");
  try {
    const result = await sendRegisterInvite(session.user.id, String(email).slice(0, 254));
    return { ok: result === "sent" || result === "recent", result, error: result === "exists" ? "They already have an account." : result === "invalid" ? "That does not look like an email." : result === "failed" ? "Could not send. Check the address." : null };
  } catch (err) {
    if (err instanceof RateLimitError) return { ok: false, result: null, error: err.message };
    throw err;
  }
}
