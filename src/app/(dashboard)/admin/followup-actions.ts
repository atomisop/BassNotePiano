"use server";

import { revalidatePath } from "next/cache";
import { getServerAuthSession } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { REMINDER_KINDS, sendFollowUpReminder, sendFollowUpRemindersToAll, type ReminderKind, type ReminderResult } from "@/lib/followUpReminders";
import { bulkReminderMessage } from "@/lib/followUpRules";

/** Sends the fixed reminder for one follow-up reason to one person. Admin only; this check is the real boundary. */
export async function sendFollowUpReminderAction(kind: string, userId: string): Promise<ReminderResult> {
  const session = await getServerAuthSession();
  if (!session?.user || session.user.role !== "ADMIN") return { ok: false, error: "Not allowed." };
  if (!REMINDER_KINDS.includes(kind as ReminderKind) || typeof userId !== "string" || userId.length > 64) return { ok: false, error: "Unknown reminder." };
  const result = await sendFollowUpReminder(kind as ReminderKind, userId);
  if (result.ok) {
    await logAudit({ actorId: session.user.id, actorEmail: session.user.email, action: "followup.reminder", targetType: "User", targetId: userId, detail: result.sentTo === userId ? kind : `${kind}, sent to the payer ${result.sentTo}` });
  }
  return result;
}

/**
 * "Remind all N": the reminder for one reason to everyone it applies to right now (the list is worked out on the server). Each one is
 * audited like a single reminder. Admin only.
 */
export async function sendAllFollowUpRemindersAction(kind: string): Promise<{ message: string }> {
  const session = await getServerAuthSession();
  if (!session?.user || session.user.role !== "ADMIN") throw new Error("Not allowed.");
  if (!REMINDER_KINDS.includes(kind as ReminderKind)) throw new Error("Unknown reminder.");
  const result = await sendFollowUpRemindersToAll(kind as ReminderKind);
  for (const s of result.sent) {
    await logAudit({ actorId: session.user.id, actorEmail: session.user.email, action: "followup.reminder", targetType: "User", targetId: s.userId, detail: `${kind}, remind all${s.sentTo === s.userId ? "" : `, sent to the payer ${s.sentTo}`}` }).catch(() => undefined);
  }
  revalidatePath("/admin/users");
  return { message: bulkReminderMessage(result) };
}
