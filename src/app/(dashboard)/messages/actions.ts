"use server";

import { getServerAuthSession } from "@/lib/auth";
import {
  sendMessage,
  getConversations,
  getConversationMessages,
  markConversationRead,
  togglePin,
  setTyping,
  reactToMessage,
  type ConversationSummary,
} from "@/lib/messages";
import {
  createGroup,
  getGroups,
  getGroupDetail,
  getGroupMessages,
  getGroupReadReceipts,
  setGroupTyping,
  getGroupTypers,
  sendGroupMessage,
  markGroupRead,
  leaveGroup,
  reactToGroupMessage,
  type GroupSummary,
} from "@/lib/groupMessages";
import { getFriendsList, SocialError } from "@/lib/social";
import { RateLimitError } from "@/lib/rateLimit";
import type { MessageRow } from "@/components/messaging/ChatWindow";

async function requireUserId(): Promise<string> {
  const session = await getServerAuthSession();
  if (!session?.user?.id) throw new SocialError("Not signed in.");
  return session.user.id;
}

export type { MessageRow };

export async function getConversationsAction(): Promise<ConversationSummary[]> {
  const userId = await requireUserId();
  return getConversations(userId);
}

export async function getConversationMessagesAction(friendId: string): Promise<MessageRow[]> {
  const userId = await requireUserId();
  try {
    const messages = await getConversationMessages(userId, friendId);
    return messages.map((m) => ({
      id: m.id,
      senderId: m.senderId,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
      readAt: m.readAt ? m.readAt.toISOString() : null,
      replyTo: m.replyTo ? { id: m.replyTo.id, senderId: m.replyTo.senderId, body: m.replyTo.body } : null,
      reactions: m.reactions,
    }));
  } catch {
    return [];
  }
}

export async function sendMessageAction(friendId: string, body: string, replyToId?: string) {
  try {
    const userId = await requireUserId();
    await sendMessage(userId, friendId, body, replyToId);
    return { ok: true as const };
  } catch (err) {
    return { ok: false as const, error: err instanceof SocialError || err instanceof RateLimitError ? err.message : "Something went wrong." };
  }
}

export async function reactToMessageAction(messageId: string, emoji: string) {
  try {
    const userId = await requireUserId();
    return { ok: true as const, ...(await reactToMessage(userId, messageId, emoji)) };
  } catch (err) {
    return { ok: false as const, error: err instanceof SocialError || err instanceof RateLimitError ? err.message : "Something went wrong." };
  }
}

export async function markConversationReadAction(friendId: string): Promise<void> {
  const userId = await requireUserId();
  await markConversationRead(userId, friendId);
}

export async function togglePinAction(friendId: string) {
  try {
    const userId = await requireUserId();
    return { ok: true as const, ...(await togglePin(userId, friendId)) };
  } catch (err) {
    return { ok: false as const, error: err instanceof SocialError || err instanceof RateLimitError ? err.message : "Something went wrong." };
  }
}

export async function setTypingAction(friendId: string): Promise<void> {
  const userId = await requireUserId();
  await setTyping(userId, friendId);
}

export interface GroupMessageReplyPreview {
  id: string;
  senderId: string;
  senderName: string | null;
  senderUsername: string | null;
  body: string;
}

export interface GroupMessageRow {
  id: string;
  senderId: string;
  senderName: string | null;
  senderUsername: string | null;
  senderImage: string | null;
  body: string;
  createdAt: string;
  replyTo: GroupMessageReplyPreview | null;
  reactions: { userId: string; emoji: string }[];
  /** Own messages only: how many other members have opened the group since this was sent (from the database). */
  seenByCount: number;
  /** Everyone else in the group right now, so the UI can say "everyone". */
  otherMemberCount: number;
}

export async function getFriendsListAction() {
  const userId = await requireUserId();
  return getFriendsList(userId);
}

export async function getGroupsAction(): Promise<GroupSummary[]> {
  const userId = await requireUserId();
  return getGroups(userId);
}

export async function getGroupMessagesAction(groupId: string): Promise<GroupMessageRow[]> {
  const userId = await requireUserId();
  try {
    const [messages, receipts] = await Promise.all([getGroupMessages(userId, groupId), getGroupReadReceipts(userId, groupId)]);
    return messages.map((m) => ({
      id: m.id,
      senderId: m.senderId,
      senderName: m.sender.name,
      senderUsername: m.sender.username,
      senderImage: m.sender.image,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
      replyTo: m.replyTo
        ? {
            id: m.replyTo.id,
            senderId: m.replyTo.senderId,
            senderName: m.replyTo.sender.name,
            senderUsername: m.replyTo.sender.username,
            body: m.replyTo.body,
          }
        : null,
      reactions: m.reactions,
      seenByCount:
        m.senderId === userId ? receipts.filter((r) => r.lastReadAt && r.lastReadAt >= m.createdAt).length : 0,
      otherMemberCount: receipts.length,
    }));
  } catch {
    return [];
  }
}

export async function sendGroupMessageAction(groupId: string, body: string, replyToId?: string) {
  try {
    const userId = await requireUserId();
    await sendGroupMessage(userId, groupId, body, replyToId);
    return { ok: true as const };
  } catch (err) {
    return { ok: false as const, error: err instanceof SocialError || err instanceof RateLimitError ? err.message : "Something went wrong." };
  }
}

export async function reactToGroupMessageAction(messageId: string, emoji: string) {
  try {
    const userId = await requireUserId();
    return { ok: true as const, ...(await reactToGroupMessage(userId, messageId, emoji)) };
  } catch (err) {
    return { ok: false as const, error: err instanceof SocialError || err instanceof RateLimitError ? err.message : "Something went wrong." };
  }
}

export async function setGroupTypingAction(groupId: string): Promise<void> {
  const userId = await requireUserId();
  try {
    await setGroupTyping(userId, groupId);
  } catch {
    // Not a member (or the group is gone): nothing to record.
  }
}

export async function getGroupTypersAction(groupId: string): Promise<string[]> {
  const userId = await requireUserId();
  try {
    return await getGroupTypers(userId, groupId);
  } catch {
    return [];
  }
}

export async function markGroupReadAction(groupId: string): Promise<void> {
  const userId = await requireUserId();
  await markGroupRead(userId, groupId);
}

export async function createGroupAction(name: string, memberUsernames: string[]) {
  try {
    const userId = await requireUserId();
    const group = await createGroup({ creatorId: userId, name, memberUsernames });
    return { ok: true as const, groupId: group.id };
  } catch (err) {
    return { ok: false as const, error: err instanceof SocialError || err instanceof RateLimitError ? err.message : "Something went wrong." };
  }
}

export async function leaveGroupAction(groupId: string) {
  try {
    const userId = await requireUserId();
    await leaveGroup(userId, groupId);
    return { ok: true as const };
  } catch (err) {
    return { ok: false as const, error: err instanceof SocialError || err instanceof RateLimitError ? err.message : "Something went wrong." };
  }
}
