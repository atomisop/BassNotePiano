"use server";

import { revalidatePath } from "next/cache";
import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendAdminMessage, MailError, type SendAdminMessageResult } from "@/lib/mail";

async function requireAdminId(): Promise<string> {
  const session = await getServerAuthSession();
  if (!session?.user?.id) throw new MailError("Not signed in.");
  if (session.user.role !== "ADMIN") throw new MailError("Admin access required.");
  return session.user.id;
}

export interface MessageRecipient {
  id: string;
  name: string | null;
  email: string;
}

/** Finds people to write to by name or email. */
export async function searchRecipientsAction(query: string): Promise<MessageRecipient[]> {
  await requireAdminId();
  const q = query.trim();
  if (q.length < 2) return [];
  return prisma.user.findMany({
    where: { OR: [{ email: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] },
    select: { id: true, name: true, email: true },
    orderBy: { createdAt: "desc" },
    take: 8,
  });
}

const MAX_RECIPIENTS = 50;

export interface SendSummary {
  sent: number;
  emailed: number;
  failed: number;
}

export async function sendMessageAction(
  recipientIds: string[],
  title: string,
  body: string,
  sendEmail: boolean,
  supportCta: boolean,
): Promise<{ ok: true; summary: SendSummary } | { ok: false; error: string }> {
  try {
    const adminId = await requireAdminId();
    const ids = Array.from(new Set(recipientIds));
    if (ids.length === 0) throw new MailError("Choose at least one person.");
    if (ids.length > MAX_RECIPIENTS) throw new MailError(`Send to ${MAX_RECIPIENTS} people at most at a time.`);
    // One message per person, so each has their own Mail entry and read receipt.
    const summary: SendSummary = { sent: 0, emailed: 0, failed: 0 };
    for (const id of ids) {
      try {
        const result: SendAdminMessageResult = await sendAdminMessage(adminId, id, title, body, { sendEmail, supportCta });
        summary.sent++;
        if (result.email === "sent") summary.emailed++;
      } catch (err) {
        // A bad title or body fails the same way for everyone, so surface it instead of counting it.
        if (summary.sent === 0 && summary.failed === 0 && err instanceof MailError) throw err;
        summary.failed++;
      }
    }
    revalidatePath("/admin/messages");
    return { ok: true, summary };
  } catch (err) {
    return { ok: false, error: err instanceof MailError ? err.message : "Something went wrong." };
  }
}
