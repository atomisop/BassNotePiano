"use server";

import { getServerAuthSession } from "@/lib/auth";
import { RateLimitError } from "@/lib/rateLimit";
import { ASK_TOGETHER_SENT, askToBookTogether, SocialError } from "@/lib/social";

/** "Ask to book together" on the family class form: a friend request by email, the same answer whether or not the email has an account. */
export async function askToBookTogetherAction(email: string): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const session = await getServerAuthSession();
  if (!session?.user) return { ok: false, error: "Sign in again." };
  try {
    await askToBookTogether(session.user.id, String(email).slice(0, 254));
    return { ok: true, message: ASK_TOGETHER_SENT };
  } catch (err) {
    if (err instanceof SocialError || err instanceof RateLimitError) return { ok: false, error: err.message };
    throw err;
  }
}
