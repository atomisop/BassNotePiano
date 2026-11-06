"use server";

import type { PrimaryInstrument, SkillLevel } from "@prisma/client";
import { getServerAuthSession } from "@/lib/auth";
import { headers } from "next/headers";
import { submitClassRegistration } from "@/lib/classRegistration";
import { prisma } from "@/lib/prisma";
import { verifyTurnstile } from "@/lib/turnstile";
import { clientIpFrom, consumeRateLimit, RateLimitError } from "@/lib/rateLimit";

export interface ClassRegistrationFormInput {
  fullName: string;
  email: string;
  phone: string;
  instrument: PrimaryInstrument;
  skillLevel: SkillLevel;
  notes: string;
  /** Honeypot: always empty from a real browser. */
  website?: string;
  turnstileToken?: string;
}

export async function submitClassRegistrationAction(
  input: ClassRegistrationFormInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  // Bots get a fake success so they learn nothing.
  if (input.website) return { ok: true };

  const session = await getServerAuthSession();

  // Each submission emails the admin and the address typed in, so an open
  // form is an email-bombing tool without a cap (per IP, and per address).
  try {
    const ip = clientIpFrom(await headers());
    if (!(await verifyTurnstile(input.turnstileToken, "class_form", ip))) return { ok: false, error: "Please complete the human check and try again." };
    await consumeRateLimit(prisma, `class-form:ip:${ip}`, { windowMinutes: 60, max: 5, message: "Too many requests from this network. Please try again later." });
    await consumeRateLimit(prisma, `class-form:email:${String(input.email).trim().toLowerCase()}`, { windowMinutes: 24 * 60, max: 3, message: "We already have your request. We'll be in touch soon." });
  } catch (err) {
    if (err instanceof RateLimitError) return { ok: false, error: err.message };
    throw err;
  }

  try {
    const { website: _website, turnstileToken: _token, ...fields } = input;
    await submitClassRegistration({ ...fields, userId: session?.user?.id });
    return { ok: true };
  } catch (err) {
    // Only our own plain validation messages go back to the visitor; a database error's text never does.
    const own = err instanceof Error && err.constructor === Error;
    return { ok: false, error: own ? (err as Error).message : "Something went wrong. Try again." };
  }
}
