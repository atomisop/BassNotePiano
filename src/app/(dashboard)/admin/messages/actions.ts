"use server";

import { getServerAuthSession } from "@/lib/auth";
import {
  sendMessage,
  getConversations,
  getConversationMessages,
  markConversationRead,
  togglePin,
  setTyping,
  searchUsersForMessaging,
  reactToMessage,
  type ConversationSummary,
  type MessageableUser,
} from "@/lib/messages";
import { SocialError } from "@/lib/social";
import { RateLimitError } from "@/lib/rateLimit";
import type { MessageRow } from "@/components/messaging/ChatWindow";

export type { MessageRow };

/**
 * Every action here requires the caller to actually be an ADMIN — the
 * friend-gate bypass in lib/messages.ts (canConverse) only checks that
 * *some* party in a given pair is an admin, so without this guard a
 * regular signed-in user could call these actions directly and message
 * anyone by claiming to act as "the admin side" of the pair.
 */
async function requireAdminId(): Promise<string> {
  const session = await getServerAuthSession();
  if (!session?.user?.id) throw new SocialError("Not signed in.");
  if (session.user.role !== "ADMIN") throw new SocialError("Admin access required.");
  return session.user.id;
}

export async function getAdminConversationsAction(): Promise<ConversationSummary[]> {
  const adminId = await requireAdminId();
  return getConversations(adminId);
}

export async function searchMessageableUsersAction(query: string): Promise<MessageableUser[]> {
  const adminId = await requireAdminId();
  return searchUsersForMessaging(query, adminId);
}

export async function getAdminConversationMessagesAction(userId: string): Promise<MessageRow[]> {
  const adminId = await requireAdminId();
  try {
    const messages = await getConversationMessages(adminId, userId);
    return messages.map((m) => ({
      id: m.id,
      senderId: m.senderId,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
      replyTo: m.replyTo ? { id: m.replyTo.id, senderId: m.replyTo.senderId, body: m.replyTo.body } : null,
      reactions: m.reactions,
    }));
  } catch {
    return [];
  }
}

export async function sendAdminMessageAction(userId: string, body: string, replyToId?: string) {
  try {
    const adminId = await requireAdminId();
    await sendMessage(adminId, userId, body, replyToId);
    return { ok: true as const };
  } catch (err) {
    return { ok: false as const, error: err instanceof SocialError || err instanceof RateLimitError ? err.message : "Something went wrong." };
  }
}

export async function reactToAdminMessageAction(messageId: string, emoji: string) {
  try {
    const adminId = await requireAdminId();
    return { ok: true as const, ...(await reactToMessage(adminId, messageId, emoji)) };
  } catch (err) {
    return { ok: false as const, error: err instanceof SocialError || err instanceof RateLimitError ? err.message : "Something went wrong." };
  }
}

export async function markAdminConversationReadAction(userId: string): Promise<void> {
  const adminId = await requireAdminId();
  await markConversationRead(adminId, userId);
}

export async function toggleAdminPinAction(userId: string) {
  try {
    const adminId = await requireAdminId();
    return { ok: true as const, ...(await togglePin(adminId, userId)) };
  } catch (err) {
    return { ok: false as const, error: err instanceof SocialError || err instanceof RateLimitError ? err.message : "Something went wrong." };
  }
}

export async function setAdminTypingAction(userId: string): Promise<void> {
  const adminId = await requireAdminId();
  await setTyping(adminId, userId);
}
