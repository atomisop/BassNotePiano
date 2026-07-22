"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { getServerAuthSession } from "@/lib/auth";
import { setUserRole, setProMembership } from "@/lib/admin";
import { unlockScaleForUser, lockScaleForUser } from "@/lib/access";

// Same pattern as admin/payments/actions.ts — the admin layout's redirect
// only protects rendering, not these Server Actions, so this re-check is
// the actual authorization boundary.
async function requireAdmin() {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/admin/users");
  if (session.user.role !== "ADMIN") redirect("/dashboard");
  return session.user;
}

export async function setUserRoleAction(targetUserId: string, role: Role) {
  const admin = await requireAdmin();
  if (targetUserId === admin.id && role !== "ADMIN") {
    // Prevents an easy self-lockout — removing your own admin role has to
    // happen from another admin account or directly against the DB.
    throw new Error("You can't remove your own admin role from this panel.");
  }
  await setUserRole(targetUserId, role);
  revalidatePath("/admin/users");
}

export async function setProMembershipAction(targetUserId: string, isPro: boolean) {
  await requireAdmin();
  await setProMembership(targetUserId, isPro);
  revalidatePath("/admin/users");
  revalidatePath("/admin");
}

export async function toggleScaleUnlockAction(targetUserId: string, scaleSlug: string, unlock: boolean) {
  await requireAdmin();
  if (unlock) {
    await unlockScaleForUser(targetUserId, scaleSlug);
  } else {
    await lockScaleForUser(targetUserId, scaleSlug);
  }
  revalidatePath("/admin/users");
  revalidatePath("/admin");
}
