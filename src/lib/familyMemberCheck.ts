import { prisma } from "@/lib/prisma";
import { hasFirstAndLastName } from "@/lib/studentName";

/** What the family form shows under one typed email. Deliberately coarse: it never says why an account cannot join beyond what the person needs to act. */
export type MemberCheck = "ready" | "no_account" | "needs_name" | "self" | "invalid";

const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function looksLikeEmail(value: string): boolean {
  return LOOKS_LIKE_EMAIL.test(value.trim());
}

/** The same account rules `createFamilyPlans` applies, asked early so a wrong email is caught while typing, not at Start. Plan status is not checked (it is not told to the payer). */
export async function checkFamilyMember(payerId: string, rawEmail: string): Promise<MemberCheck> {
  const email = rawEmail.trim().toLowerCase();
  if (!looksLikeEmail(email)) return "invalid";
  const [payer, other] = await Promise.all([
    prisma.user.findUnique({ where: { id: payerId }, select: { email: true } }),
    prisma.user.findUnique({ where: { email }, select: { name: true, role: true, bannedAt: true } }),
  ]);
  if (payer && payer.email.toLowerCase() === email) return "self";
  if (!other) return "no_account";
  // A banned or admin account answers exactly like a missing one, so this cannot be used to find out who the admin is or who was banned.
  if (other.bannedAt || other.role !== "STUDENT") return "no_account";
  if (!hasFirstAndLastName(other.name)) return "needs_name";
  return "ready";
}
