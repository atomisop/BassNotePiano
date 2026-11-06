"use server";

import { revalidatePath } from "next/cache";
import { getServerAuthSession } from "@/lib/auth";
import { claimScholarshipCode, ScholarshipError } from "@/lib/scholarships";
import { RateLimitError } from "@/lib/rateLimit";
import { creditsLabelFromStored } from "@/lib/classCreditPricing";

export type ClaimResult = { ok: true; message: string } | { ok: false; error: string };

/** Claims a scholarship code for the signed-in account. The server checks the code, the email it was made for and that it is unclaimed. */
export async function claimScholarshipAction(code: string): Promise<ClaimResult> {
  const session = await getServerAuthSession();
  if (!session?.user?.id) return { ok: false, error: "Sign in first." };
  try {
    const { credits, balance } = await claimScholarshipCode(session.user.id, code);
    revalidatePath("/", "layout");
    return { ok: true, message: `Scholarship claimed. ${creditsLabelFromStored(credits)} added, your balance is now ${creditsLabelFromStored(balance)}.` };
  } catch (err) {
    if (err instanceof ScholarshipError || err instanceof RateLimitError) return { ok: false, error: err.message };
    console.error("Scholarship claim failed:", err);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
