"use server";

import type { PrimaryInstrument, SkillLevel } from "@prisma/client";
import { getServerAuthSession } from "@/lib/auth";
import { submitClassRegistration } from "@/lib/classRegistration";

export interface ClassRegistrationFormInput {
  fullName: string;
  email: string;
  phone: string;
  instrument: PrimaryInstrument;
  skillLevel: SkillLevel;
  notes: string;
}

export async function submitClassRegistrationAction(
  input: ClassRegistrationFormInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await getServerAuthSession();

  try {
    await submitClassRegistration({ ...input, userId: session?.user?.id });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong. Try again." };
  }
}
