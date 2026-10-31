"use server";

import { getServerAuthSession } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { REMINDER_KINDS, sendFollowUpReminder, type ReminderKind, type ReminderResult } from "@/lib/followUpReminders";

/** Sends the fixed reminder for one follow-up reason to one person. Admin only; this check is the real boundary. */
export async function sendFollowUpReminderAction(kind: string, userId: string): Promise<ReminderResult> {
  const session = await getServerAuthSession();
  if (!session?.user || session.user.role !== "ADMIN") return { ok: false, error: "Not allowed." };
  if (!REMINDER_KINDS.includes(kind as ReminderKind) || typeof userId !== "string" || userId.length > 64) return { ok: false, error: "Unknown reminder." };
  const result = await sendFollowUpReminder(kind as ReminderKind, userId);
  if (result.ok) {
    await logAudit({ actorId: session.user.id, actorEmail: session.user.email, action: "followup.reminder", targetType: "User", targetId: userId, detail: kind });
  }
  return result;
}
