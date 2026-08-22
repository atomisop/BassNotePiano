"use server";

import { getServerAuthSession } from "@/lib/auth";
import {
  sendMessage,
  getConversations,
  getConversationMessages,
  markConversationRead,
  togglePin,
  setTyping,
  type ConversationSummary,
} from "@/lib/messages";
import {
  createGroup,
  getGroups,
  getGroupDetail,
  getGroupMessages,
  sendGroupMessage,
  markGroupRead,
  leaveGroup,
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

export interface GroupMessageRow {
  id: string;
  senderId: string;
  senderName: string | null;
  senderUsername: string | null;
  senderImage: string | null;
  body: string;
  createdAt: string;
}

export async function getFriendsListAction() {
  const userId = await requireUserId();
  return getFriendsList(userId);
}

export async function getGroupsAction(): Promise<GroupSummary[]> {
  const userId = await requireUserId();
  return getGroups(userId);
}

export async function getGroupDetailAction(groupId: string) {
  const userId = await requireUserId();
  try {
    const group = await getGroupDetail(userId, groupId);
    return {
      ok: true as const,
      id: group.id,
      name: group.name,
      members: group.members.map((m) => ({
        userId: m.userId,
        name: m.user.name,
        username: m.user.username,
        image: m.user.image,
      })),
    };
  } catch (err) {
    return { ok: false as const, error: err instanceof SocialError || err instanceof RateLimitError ? err.message : "Something went wrong." };
  }
}

export async function getGroupMessagesAction(groupId: string): Promise<GroupMessageRow[]> {
  const userId = await requireUserId();
  try {
    const messages = await getGroupMessages(userId, groupId);
    return messages.map((m) => ({
      id: m.id,
      senderId: m.senderId,
      senderName: m.sender.name,
      senderUsername: m.sender.username,
      senderImage: m.sender.image,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
    }));
  } catch {
    return [];
  }
}

export async function sendGroupMessageAction(groupId: string, body: string) {
  try {
    const userId = await requireUserId();
    await sendGroupMessage(userId, groupId, body);
    return { ok: true as const };
  } catch (err) {
    return { ok: false as const, error: err instanceof SocialError || err instanceof RateLimitError ? err.message : "Something went wrong." };
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
