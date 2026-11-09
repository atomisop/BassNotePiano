"use server";

import { revalidatePath } from "next/cache";
import { getServerAuthSession } from "@/lib/auth";
import { RateLimitError } from "@/lib/rateLimit";
import { submitSignedInApplication, TrialApplicationError } from "@/lib/trialApplication";

/** "Ask for a free trial class" on Home: the application goes from the account itself, with only what the account is missing asked. */
export async function askForTrialClassAction(input: { instrument?: string; skillLevel?: string; phone?: string; note?: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await getServerAuthSession();
  if (!session?.user) return { ok: false, error: "Sign in again." };
  try {
    await submitSignedInApplication(session.user.id, {
      instrument: typeof input?.instrument === "string" ? input.instrument : null,
      skillLevel: typeof input?.skillLevel === "string" ? input.skillLevel : null,
      phone: typeof input?.phone === "string" ? input.phone.slice(0, 40) : null,
      note: typeof input?.note === "string" ? input.note.slice(0, 2000) : null,
    });
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (err) {
    if (err instanceof TrialApplicationError || err instanceof RateLimitError) return { ok: false, error: err.message };
    throw err;
  }
}
