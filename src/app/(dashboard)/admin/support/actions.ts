"use server";

import { revalidatePath } from "next/cache";
import type { AssistantEscalationStatus, SupportThreadSource } from "@prisma/client";
import { getServerAuthSession } from "@/lib/auth";
import {
  getSupportThreads,
  getSupportThread,
  postAdminReply,
  setSupportTyping,
  resolveSupportThread,
  deleteSupportThread,
  transferSupportThread,
  listMentionableAdmins,
  AssistantEscalationError,
  type AdminThreadSummary,
  type AdminThreadMessage,
  type AdminThreadDetail,
} from "@/lib/support";
import { parseSlashCommand, type MentionableAdmin } from "@/lib/supportCommands";

export type { AdminThreadSummary, AdminThreadMessage, AdminThreadDetail };

async function requireAdminId(): Promise<string> {
  const session = await getServerAuthSession();
  if (!session?.user?.id) throw new Error("Not signed in.");
  if (session.user.role !== "ADMIN") throw new Error("Admin access required.");
  return session.user.id;
}

/** `mine` lists the cases transferred to the signed-in admin, across chat and email. */
export async function getSupportThreadsAction(
  status?: AssistantEscalationStatus,
  source?: SupportThreadSource,
  mine?: boolean,
): Promise<AdminThreadSummary[]> {
  const adminId = await requireAdminId();
  if (mine) return getSupportThreads(undefined, undefined, undefined, adminId);
  return getSupportThreads(status, undefined, source);
}

export async function getSupportThreadAction(escalationId: string): Promise<AdminThreadDetail | null> {
  await requireAdminId();
  return getSupportThread(escalationId);
}

export async function listMentionableAdminsAction(): Promise<MentionableAdmin[]> {
  await requireAdminId();
  return listMentionableAdmins();
}

/**
 * The reply box. Text starting with /name is a transfer to that admin, never a
 * message to the customer, and a leading slash that matches nobody is refused
 * rather than sent. Anything else is a reply.
 */
export async function sendSupportReplyAction(escalationId: string, body: string) {
  try {
    const adminId = await requireAdminId();
    if (body.trimStart().startsWith("/")) {
      const command = parseSlashCommand(body);
      if (!command) {
        return { ok: false as const, error: "Start your reply with a word. A leading / is for transfers like /isaac or /admin." };
      }
      const { label } = await transferSupportThread({ escalationId, fromAdminId: adminId, token: command.token, note: command.rest });
      return { ok: true as const, transferredTo: label };
    }
    await postAdminReply(escalationId, adminId, body);
    return { ok: true as const, transferredTo: null };
  } catch (err) {
    return { ok: false as const, error: err instanceof AssistantEscalationError ? err.message : "Something went wrong." };
  }
}

/** The team is writing a reply: the customer sees "Support is typing". */
export async function setSupportTypingAction(escalationId: string, typing = true): Promise<void> {
  await requireAdminId();
  await setSupportTyping(escalationId, "SUPPORT", typing);
}

export async function resolveSupportThreadAction(escalationId: string): Promise<void> {
  const adminId = await requireAdminId();
  await resolveSupportThread(escalationId, adminId);
}

export async function deleteSupportThreadAction(escalationId: string): Promise<void> {
  await requireAdminId();
  await deleteSupportThread(escalationId);
  revalidatePath("/admin/support");
  revalidatePath("/admin");
}
