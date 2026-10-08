"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { forgetPayerName } from "@/lib/paymentReceipts";

// Same pattern as every other admin actions.ts, the admin layout's
// redirect only protects rendering, not these Server Actions, so this
// re-check is the actual authorization boundary.
async function requireAdmin() {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/admin/users");
  if (session.user.role !== "ADMIN") redirect("/dashboard");
  return session.user;
}

/**
 * The same mechanism the student's own "Sign out of all other devices"
 * button uses (see account/actions.ts's signOutOtherDevicesAction), every
 * JWT carries the sessionVersion it was issued with, and NextAuth's
 * session callback compares it against the DB's current value on every
 * request, rejecting anything older. Bumping it here signs out every
 * device signed into this account, including the one they're on right
 * now, without touching a password. Useful for "I think my account was
 * compromised" or "I'm locked out of a stuck session" support requests.
 */
export async function adminForceSignOutAction(targetUserId: string) {
  const admin = await requireAdmin();
  await prisma.user.update({ where: { id: targetUserId }, data: { sessionVersion: { increment: 1 } } });
  await logAudit({ actorId: admin.id, actorEmail: admin.email, action: "user.sign-out-everywhere", targetType: "User", targetId: targetUserId });
  revalidatePath(`/admin/users/${targetUserId}`);
}

/** Stops a saved payer name from clearing this student's payments by itself. */
export async function forgetPayerNameAction(targetUserId: string, aliasId: string) {
  const admin = await requireAdmin();
  // Scoped to this student, so an id from another page cannot remove someone else's.
  const alias = await prisma.payerAlias.findFirst({ where: { id: aliasId, userId: targetUserId }, select: { id: true } });
  if (alias) await forgetPayerName({ aliasId: alias.id, admin: { id: admin.id, email: admin.email ?? null } });
  revalidatePath(`/admin/users/${targetUserId}`);
}
