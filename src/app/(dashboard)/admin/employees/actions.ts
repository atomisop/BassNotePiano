"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { revokeEmployee } from "@/lib/admin";
import { isOwnerEmail, setAdminNotificationSetting, type AdminNotificationKind } from "@/lib/adminNotifications";

// Server Actions are separate endpoints the admin layout never guards, so
// this is the real authorization check, same as the other admin actions files.
async function requireAdmin() {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/admin/employees");
  if (session.user.role !== "ADMIN") redirect("/dashboard");
  return session.user;
}

export async function revokeEmployeeAction(targetUserId: string): Promise<{ ok: boolean; error: string | null }> {
  const admin = await requireAdmin();
  // Only the owner removes admins. An employee can't remove another employee.
  if (!isOwnerEmail(admin.email)) return { ok: false, error: "Only the owner can revoke admin access." };
  try {
    await revokeEmployee(targetUserId, admin.id);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not revoke access." };
  }
  revalidatePath("/admin/employees");
  return { ok: true, error: null };
}

/** Owner only: decides whether employees get one kind of admin notification. */
export async function setEmployeeNotificationAction(kind: AdminNotificationKind, enabled: boolean): Promise<{ ok: boolean; error: string | null }> {
  const admin = await requireAdmin();
  if (!isOwnerEmail(admin.email)) return { ok: false, error: "Only the owner can change this." };
  try {
    await setAdminNotificationSetting(kind, enabled);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not save." };
  }
  revalidatePath("/admin/employees");
  return { ok: true, error: null };
}
