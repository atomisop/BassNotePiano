"use server";

import { getServerAuthSession } from "@/lib/auth";
import {
  sendMessage,
  getConversations,
  getConversationMessages,
  markConversationRead,
  type ConversationSummary,
} from "@/lib/messages";
import { SocialError } from "@/lib/social";

async function requireUserId(): Promise<string> {
  const session = await getServerAuthSession();
  if (!session?.user?.id) throw new SocialError("Not signed in.");
  return session.user.id;
}

export interface MessageRow {
  id: string;
  senderId: string;
  body: string;
  createdAt: string;
}

export async function getConversationsAction(): Promise<ConversationSummary[]> {
  const userId = await requireUserId();
  return getConversations(userId);
}

export async function getConversationMessagesAction(friendId: string): Promise<MessageRow[]> {
  const userId = await requireUserId();
  try {
    const messages = await getConversationMessages(userId, friendId);
    return messages.map((m) => ({ id: m.id, senderId: m.senderId, body: m.body, createdAt: m.createdAt.toISOString() }));
  } catch {
    return [];
  }
}

export async function sendMessageAction(friendId: string, body: string) {
  try {
    const userId = await requireUserId();
    await sendMessage(userId, friendId, body);
    return { ok: true as const };
  } catch (err) {
    return { ok: false as const, error: err instanceof SocialError ? err.message : "Something went wrong." };
  }
}

export async function markConversationReadAction(friendId: string): Promise<void> {
  const userId = await requireUserId();
  await markConversationRead(userId, friendId);
}
