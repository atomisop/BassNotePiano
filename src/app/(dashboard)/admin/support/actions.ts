"use server";

import type { AssistantEscalationStatus } from "@prisma/client";
import { getServerAuthSession } from "@/lib/auth";
import {
  getSupportThreads,
  getSupportThread,
  postAdminReply,
  resolveSupportThread,
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

export async function getSupportThreadsAction(status?: AssistantEscalationStatus): Promise<AdminThreadSummary[]> {
  await requireAdminId();
  return getSupportThreads(status);
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

export async function resolveSupportThreadAction(escalationId: string): Promise<void> {
  const adminId = await requireAdminId();
  await resolveSupportThread(escalationId, adminId);
}
