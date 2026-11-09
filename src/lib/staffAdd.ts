import { prisma } from "@/lib/prisma";
import { setUserRole } from "@/lib/admin";
import { logAudit } from "@/lib/audit";

/**
 * "Add staff" on Admin > People > Staff: the owner types an email, sees the account, and confirms. Giving admin access goes through the
 * same `setUserRole` and the same `user.role` audit line as "Make admin" on a person's page, so both read the same in the activity log.
 * Owner only: the caller checks that (`isOwnerEmail`) before either step, so these lookups never answer anyone else.
 */
export interface StaffCandidate {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  /** They have a running plan (they keep it; staff access does not touch it). */
  onPlan: boolean;
}

export type StaffLookup = { ok: true; account: StaffCandidate } | { ok: false; error: string };

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Why an account cannot become staff, or null when it can. */
function refusal(user: { name: string | null; email: string; role: string; bannedAt: Date | null; emailVerified: Date | null }): string | null {
  if (user.bannedAt) return "That account is banned, so it can't be staff.";
  if (user.role === "ADMIN") return `${user.name ?? user.email} is already staff.`;
  // An address nobody has confirmed may not belong to the person who typed it in at sign-up.
  if (!user.emailVerified) return "That account has not confirmed its email yet. Ask them to finish signing up, then add them.";
  return null;
}

const SELECT = { id: true, name: true, email: true, image: true, role: true, bannedAt: true, emailVerified: true, _count: { select: { paymentPlans: { where: { status: "ACTIVE" as const } } } } } as const;

export async function findStaffCandidate(rawEmail: string): Promise<StaffLookup> {
  const email = String(rawEmail ?? "").trim().toLowerCase().slice(0, 254);
  if (!EMAIL_SHAPE.test(email)) return { ok: false, error: "Type their full email address." };
  const user = await prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } }, select: SELECT });
  if (!user) return { ok: false, error: "No account uses that email. Ask them to sign up first, then add them here." };
  const why = refusal(user);
  if (why) return { ok: false, error: why };
  return { ok: true, account: { id: user.id, name: user.name, email: user.email, image: user.image, onPlan: user._count.paymentPlans > 0 } };
}

/** Makes the account staff (role ADMIN) and audits it. Checks the account again: the screen's answer may be minutes old. */
export async function addStaff(actor: { id: string; email: string }, userId: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const user = await prisma.user.findUnique({ where: { id: String(userId) }, select: SELECT });
  if (!user) return { ok: false, error: "That account no longer exists." };
  const why = refusal(user);
  if (why) return { ok: false, error: why };
  await setUserRole(user.id, "ADMIN");
  await logAudit({ actorId: actor.id, actorEmail: actor.email, action: "user.role", targetType: "User", targetId: user.id, detail: `${user.email} is now ADMIN` });
  return { ok: true, id: user.id };
}
