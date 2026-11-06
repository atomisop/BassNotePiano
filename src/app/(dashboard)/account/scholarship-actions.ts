"use server";

import { revalidatePath } from "next/cache";
import { getServerAuthSession } from "@/lib/auth";
import { claimScholarshipCode, ScholarshipError } from "@/lib/scholarships";
import { RateLimitError } from "@/lib/rateLimit";
import { describePaymentPlan, OFFERED_PLAN_CADENCE } from "@/lib/classCreditPricing";

export type ClaimResult = { ok: true; message: string } | { ok: false; error: string };

/** Claims a scholarship code for the signed-in account. The server checks the code, the email it was made for and that it is unclaimed. */
export async function claimScholarshipAction(code: string): Promise<ClaimResult> {
  const session = await getServerAuthSession();
  if (!session?.user?.id) return { ok: false, error: "Sign in first." };
  try {
    const { percent, planChange } = await claimScholarshipCode(session.user.id, code);
    revalidatePath("/", "layout");
    const plan = describePaymentPlan(OFFERED_PLAN_CADENCE, "TERM_6");
    const price = planChange && planChange.fromCents !== planChange.toCents ? ` Your running plan is now ${(planChange.toCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })} per payment.` : "";
    return { ok: true, message: `Scholarship claimed: ${percent}% off the 6 Month plan (${plan}). It only applies to the 6 Month plan.${price}` };
  } catch (err) {
    if (err instanceof ScholarshipError || err instanceof RateLimitError) return { ok: false, error: err.message };
    console.error("Scholarship claim failed:", err);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
