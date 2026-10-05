"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { revokeEmployee } from "@/lib/admin";

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
  try {
    await revokeEmployee(targetUserId, admin.id);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not revoke access." };
  }
  revalidatePath("/admin/employees");
  return { ok: true, error: null };
}
