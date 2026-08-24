"use server";

import { getServerAuthSession } from "@/lib/auth";
import { resolveAssistantEscalation } from "@/lib/assistantEscalation";

async function requireAdminId(): Promise<string> {
  const session = await getServerAuthSession();
  if (!session?.user?.id) throw new Error("Not signed in.");
  if (session.user.role !== "ADMIN") throw new Error("Admin access required.");
  return session.user.id;
}

export async function resolveAssistantEscalationAction(escalationId: string): Promise<void> {
  const adminId = await requireAdminId();
  await resolveAssistantEscalation(escalationId, adminId);
}
