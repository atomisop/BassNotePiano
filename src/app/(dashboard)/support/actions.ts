"use server";

import { getServerAuthSession } from "@/lib/auth";
import { getSupportChat, sendSupportChatMessage, markSupportChatRead, type SupportChat } from "@/lib/messagesSupport";
import { AssistantEscalationError } from "@/lib/support";

async function requireUserId(): Promise<string> {
  const session = await getServerAuthSession();
  if (!session?.user?.id) throw new AssistantEscalationError("Not signed in.");
  return session.user.id;
}

/** The signed-in person's own Support thread (the bell's Support tab). Always scoped to the session, never to anything the browser sends. */
export async function getSupportChatAction(): Promise<SupportChat> {
  return getSupportChat(await requireUserId());
}

export async function sendSupportChatMessageAction(body: string) {
  try {
    await sendSupportChatMessage(await requireUserId(), body);
    return { ok: true as const };
  } catch (err) {
    return { ok: false as const, error: err instanceof AssistantEscalationError ? err.message : "Something went wrong." };
  }
}

export async function markSupportChatReadAction() {
  await markSupportChatRead(await requireUserId());
}
