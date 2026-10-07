"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import {
  searchUsersForCredits,
  adjustUserCredits,
  getUserCreditHistory,
  CreditAdjustmentError,
} from "@/lib/creditAdjustments";

// Same pattern as every other admin actions.ts this session — the admin
// layout's redirect only protects rendering, not these Server Actions,
// so this re-check is the actual authorization boundary.
async function requireAdmin() {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/admin/payments?tab=credits");
  if (session.user.role !== "ADMIN") redirect("/dashboard");
  return session.user;
}

export async function searchUsersForCreditsAction(query: string) {
  await requireAdmin();
  return searchUsersForCredits(query);
}

export async function getUserCreditHistoryAction(userId: string) {
  await requireAdmin();
  return getUserCreditHistory(userId);
}

export async function adjustUserCreditsAction(targetUserId: string, amount: number, reasonNote: string) {
  const admin = await requireAdmin();
  try {
    const result = await adjustUserCredits(admin.id, targetUserId, amount, reasonNote);
    await logAudit({ actorId: admin.id, actorEmail: admin.email, action: amount > 0 ? "credits.grant" : "credits.revoke", targetType: "User", targetId: targetUserId, detail: `${amount > 0 ? "+" : ""}${amount}. ${reasonNote}` });
    revalidatePath("/admin/payments");
    return { ok: true as const, balance: result.balance };
  } catch (err) {
    if (err instanceof CreditAdjustmentError) {
      return { ok: false as const, error: err.message };
    }
    throw err;
  }
}
