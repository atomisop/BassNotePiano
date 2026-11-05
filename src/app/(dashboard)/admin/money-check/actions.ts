"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { isOwnerEmail } from "@/lib/adminNotifications";
import { withStudentNotice } from "@/lib/notifyScope";
import { applyMoneyFix, type MoneyFixId } from "@/lib/moneyCheck";

// Server Actions are separate endpoints the admin layout never runs for, so this is the real owner check.
export async function applyMoneyFixAction(key: string, fix: MoneyFixId): Promise<{ ok: boolean; message: string }> {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/admin/money-check");
  if (session.user.role !== "ADMIN" || !isOwnerEmail(session.user.email)) return { ok: false, message: "Only the owner can fix these." };
  if (!["setPaid", "closeBill", "undoRefund"].includes(fix)) return { ok: false, message: "Unknown fix." };
  try {
    // A repair is quiet: the student is not sent a notice about the studio tidying a record.
    const message = await withStudentNotice(false, () => applyMoneyFix({ id: session.user.id, email: session.user.email ?? null }, String(key), fix));
    revalidatePath("/", "layout");
    return { ok: true, message };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Could not fix that." };
  }
}
