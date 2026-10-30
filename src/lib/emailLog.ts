import type { EmailStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Writes the record of one email (see EmailLog in the schema): to whom, the subject, and whether it was sent, skipped or failed.
 * Recording never gets in the way of sending: a failure here is logged and swallowed. The account is found by the address when the
 * caller does not know it (an applicant with no account is recorded without one).
 */
export async function recordEmail(entry: { to: string; subject: string; status: EmailStatus; detail?: string | null; resendId?: string | null; userId?: string | null }) {
  try {
    const userId =
      entry.userId ??
      (await prisma.user.findFirst({ where: { email: { equals: entry.to, mode: "insensitive" } }, select: { id: true } }))?.id ??
      null;
    await prisma.emailLog.create({
      data: {
        userId,
        to: entry.to.slice(0, 320),
        subject: entry.subject.slice(0, 300),
        status: entry.status,
        detail: entry.detail ? entry.detail.slice(0, 300) : null,
        resendId: entry.resendId ?? null,
      },
    });
  } catch (err) {
    console.error("Could not record an email:", err instanceof Error ? err.message : err);
  }
}

/** Records older than this are removed by the daily clean-up (only the address and subject are kept, but not forever). */
export const EMAIL_LOG_KEEP_DAYS = 180;

export async function purgeOldEmailLogs(now: Date = new Date()): Promise<number> {
  const { count } = await prisma.emailLog.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - EMAIL_LOG_KEEP_DAYS * 86_400_000) } } });
  return count;
}
