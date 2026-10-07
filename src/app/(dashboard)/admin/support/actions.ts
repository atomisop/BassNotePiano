"use server";

import type { AssistantEscalationStatus, SupportThreadSource } from "@prisma/client";
import { getServerAuthSession } from "@/lib/auth";
import {
  getSupportThreads,
  getSupportThread,
  postAdminReply,
  setSupportTyping,
  resolveSupportThread,
  deleteSupportThread,
  AssistantEscalationError,
  type AdminThreadSummary,
  type AdminThreadMessage,
} from "@/lib/support";

export type { AdminThreadSummary, AdminThreadMessage };

async function requireAdminId(): Promise<string> {
  const session = await getServerAuthSession();
  if (!session?.user?.id) throw new Error("Not signed in.");
  if (session.user.role !== "ADMIN") throw new Error("Admin access required.");
  return session.user.id;
}

export async function getSupportThreadsAction(status?: AssistantEscalationStatus, source?: SupportThreadSource): Promise<AdminThreadSummary[]> {
  await requireAdminId();
  return getSupportThreads(status, undefined, source);
}

export async function getSupportThreadAction(escalationId: string) {
  await requireAdminId();
  return getSupportThread(escalationId);
}

export async function sendSupportReplyAction(escalationId: string, body: string) {
  try {
    const adminId = await requireAdminId();
    await postAdminReply(escalationId, adminId, body);
    return { ok: true as const };
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
}
