"use server";

import { revalidatePath } from "next/cache";
import { getServerAuthSession } from "@/lib/auth";
import {
  searchUsersByUsername,
  sendFriendRequest,
  respondToFriendRequest,
  blockUser,
  unblockUser,
  withdrawEmailAsk,
  SocialError,
} from "@/lib/social";
import { sendNudge } from "@/lib/nudge";
import { getFriendProfile } from "@/lib/friendProfile";
import { RateLimitError } from "@/lib/rateLimit";

async function requireUserId(): Promise<string> {
  const session = await getServerAuthSession();
  if (!session?.user?.id) throw new SocialError("Not signed in.");
  return session.user.id;
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
    return { ok: false as const, error: err instanceof SocialError || err instanceof RateLimitError ? err.message : "Something went wrong." };
  }
}

export async function respondToFriendRequestAction(requestId: string, accept: boolean) {
  try {
    const userId = await requireUserId();
    await respondToFriendRequest(userId, requestId, accept);
    revalidatePath("/friends");
    return { ok: true as const };
  } catch (err) {
    return { ok: false as const, error: err instanceof SocialError || err instanceof RateLimitError ? err.message : "Something went wrong." };
  }
}

/** Takes back an "ask to book together" by email (only the sender's own). */
export async function withdrawEmailAskAction(askId: string) {
  try {
    const userId = await requireUserId();
    await withdrawEmailAsk(userId, String(askId));
    revalidatePath("/friends");
    return { ok: true as const };
  } catch (err) {
    return { ok: false as const, error: err instanceof SocialError ? err.message : "Something went wrong." };
  }
}

/** One friend's practice and badges, for the panel that opens under their row. Null unless they are an accepted friend (see getFriendProfile). */
export async function getFriendProfileAction(username: string) {
  const userId = await requireUserId();
  return getFriendProfile(userId, username);
}

export async function nudgeFriendAction(friendId: string) {
  try {
    const userId = await requireUserId();
    await sendNudge(userId, friendId);
    return { ok: true as const };
  } catch (err) {
    return { ok: false as const, error: err instanceof SocialError || err instanceof RateLimitError ? err.message : "Something went wrong." };
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
