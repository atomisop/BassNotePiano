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

export async function sendMessageAction(
  recipientId: string,
  title: string,
  body: string,
  sendEmail: boolean,
  supportCta: boolean,
): Promise<{ ok: true; result: SendAdminMessageResult } | { ok: false; error: string }> {
  try {
    const adminId = await requireAdminId();
    const result = await sendAdminMessage(adminId, recipientId, title, body, { sendEmail, supportCta });
    revalidatePath("/admin/messages");
    return { ok: true, result };
  } catch (err) {
    return { ok: false, error: err instanceof MailError ? err.message : "Something went wrong." };
  }
}
