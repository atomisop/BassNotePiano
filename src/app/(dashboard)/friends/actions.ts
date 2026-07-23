"use server";

import { revalidatePath } from "next/cache";
import { getServerAuthSession } from "@/lib/auth";
import {
  setUsername,
  searchUsersByUsername,
  sendFriendRequest,
  respondToFriendRequest,
  blockUser,
  unblockUser,
  SocialError,
} from "@/lib/social";

async function requireUserId(): Promise<string> {
  const session = await getServerAuthSession();
  if (!session?.user?.id) throw new SocialError("Not signed in.");
  return session.user.id;
}

export async function setUsernameAction(username: string) {
  try {
    const userId = await requireUserId();
    await setUsername(userId, username);
    revalidatePath("/friends");
    return { ok: true as const };
  } catch (err) {
    return { ok: false as const, error: err instanceof SocialError ? err.message : "Something went wrong." };
  }
}

export async function searchUsersAction(query: string) {
  const userId = await requireUserId();
  return searchUsersByUsername(query, userId);
}

export async function sendFriendRequestAction(receiverUsername: string) {
  try {
    const userId = await requireUserId();
    await sendFriendRequest(userId, receiverUsername);
    revalidatePath("/friends");
    return { ok: true as const };
  } catch (err) {
    return { ok: false as const, error: err instanceof SocialError ? err.message : "Something went wrong." };
  }
}

export async function respondToFriendRequestAction(requestId: string, accept: boolean) {
  try {
    const userId = await requireUserId();
    await respondToFriendRequest(userId, requestId, accept);
    revalidatePath("/friends");
    return { ok: true as const };
  } catch (err) {
    return { ok: false as const, error: err instanceof SocialError ? err.message : "Something went wrong." };
  }
}

export async function blockUserAction(blockedId: string) {
  const userId = await requireUserId();
  await blockUser(userId, blockedId);
  revalidatePath("/friends");
}

export async function unblockUserAction(blockedId: string) {
  const userId = await requireUserId();
  await unblockUser(userId, blockedId);
  revalidatePath("/friends");
}
