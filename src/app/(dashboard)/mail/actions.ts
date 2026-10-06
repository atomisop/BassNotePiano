"use server";

import { revalidatePath } from "next/cache";
import { getServerAuthSession } from "@/lib/auth";
import { getMailUnreadCount, markAllMailRead, openSupportCaseFromMail, MailError } from "@/lib/mail";

export async function markAllMailReadAction(): Promise<void> {
  const session = await getServerAuthSession();
  if (!session?.user) return;
  await markAllMailRead(session.user.id);
  revalidatePath("/mail");
}

/** "Contact support" on a message: opens a case in Support Chat and returns its id. */
export async function contactSupportFromMailAction(mailId: string): Promise<{ ok: true; escalationId: string } | { ok: false; error: string }> {
  const session = await getServerAuthSession();
  if (!session?.user) return { ok: false, error: "Sign in again." };
  try {
    const { escalationId } = await openSupportCaseFromMail(session.user.id, mailId);
    revalidatePath(`/mail/${mailId}`);
    return { ok: true, escalationId };
  } catch (err) {
    return { ok: false, error: err instanceof MailError ? err.message : "Something went wrong. Please try again." };
  }
}
