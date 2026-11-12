"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { revokeEmployee } from "@/lib/admin";
import { isOwnerEmail, setAdminNotificationSetting, type AdminNotificationKind } from "@/lib/adminNotifications";
import { setAutomation } from "@/lib/appSettings";
import type { AutomationKey } from "@/lib/automationKeys";
import { logAudit } from "@/lib/audit";
import { addStaff, findStaffCandidate, type StaffLookup } from "@/lib/staffAdd";
import { runOnce } from "@/lib/idempotency";

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
    await logAudit({ actorId: admin.id, actorEmail: admin.email, action: "user.role", targetType: "User", targetId: targetUserId, detail: "Admin access removed" });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not revoke access." };
  }
  revalidatePath("/admin/employees");
  return { ok: true, error: null };
}

/** Owner only: "Add staff", step one. Shows the account an email belongs to, or says plainly why it cannot be added. */
export async function findStaffCandidateAction(email: string): Promise<StaffLookup> {
  const admin = await requireAdmin();
  if (!isOwnerEmail(admin.email)) return { ok: false, error: "Only the owner can add staff." };
  return findStaffCandidate(email);
}

/** Owner only: "Add staff", step two. Gives the account admin access (same path and audit line as "Make admin" on their page). */
export async function addStaffAction(userId: string, idempotencyKey?: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const admin = await requireAdmin();
  if (!isOwnerEmail(admin.email)) return { ok: false, error: "Only the owner can add staff." };
  const result = await runOnce(admin.id, "staff-add", idempotencyKey, () => addStaff({ id: admin.id, email: admin.email ?? "" }, userId), {
    isSuccess: (r) => r.ok,
    whileRunning: { ok: false, error: "Already adding them." },
  });
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

/** Owner only: decides whether the owner or employees get one kind of admin notification. */
export async function setEmployeeNotificationAction(kind: AdminNotificationKind, who: "owner" | "employees", enabled: boolean): Promise<{ ok: boolean; error: string | null }> {
  const admin = await requireAdmin();
  if (!isOwnerEmail(admin.email)) return { ok: false, error: "Only the owner can change this." };
  try {
    await setAdminNotificationSetting(kind, who === "owner" ? "owner" : "employees", enabled);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not save." };
  }
  revalidatePath("/admin/employees");
  return { ok: true, error: null };
}

/** Owner only: switches one automatic approval on or off. */
export async function setAutomationAction(key: AutomationKey, enabled: boolean): Promise<{ ok: boolean; error: string | null }> {
  const admin = await requireAdmin();
  if (!isOwnerEmail(admin.email)) return { ok: false, error: "Only the owner can change this." };
  try {
    await setAutomation(key, enabled);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not save." };
  }
  await logAudit({ actorId: admin.id, actorEmail: admin.email, action: "automation.set", detail: `${key} ${enabled ? "on" : "off"}` });
  revalidatePath("/admin/employees");
  return { ok: true, error: null };
}
