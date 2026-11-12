import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/notifications";
import { assertParentOf } from "@/lib/parentLinks";
import { finalizeFriendship } from "@/lib/social";

/**
 * A child account's friendships belong to their parent. A friendship with a child in it waits here (status PARENT_REVIEW) until a linked parent of
 * that child approves it; if both sides are children, both need a parent. Any parent declining ends the request. A parent can also remove one of
 * their child's existing friends. Everything is checked against the parent link (assertParentOf), never trusted from the browser.
 */

export class FriendReviewError extends Error {}

export interface FriendReviewRow {
  requestId: string;
  otherName: string;
  otherUsername: string | null;
}

export interface ChildFriendRow {
  requestId: string;
  userId: string;
  name: string;
  username: string | null;
}

const who = { select: { id: true, name: true, username: true } } as const;

/** Friendships still waiting for this child's parent. */
export async function listReviewsForChild(parentId: string, childId: string): Promise<FriendReviewRow[]> {
  await assertParentOf(parentId, childId);
  const rows = await prisma.friendParentApproval.findMany({
    where: { childId, approvedAt: null, request: { status: "PARENT_REVIEW" } },
    include: { request: { include: { sender: who, receiver: who } } },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => {
    const other = r.request.senderId === childId ? r.request.receiver : r.request.sender;
    return { requestId: r.requestId, otherName: other.name?.split(" ")[0] ?? "Someone", otherUsername: other.username };
  });
}

/** How many friendships wait for any of these children (for a badge). */
export async function countReviewsFor(childIds: string[]): Promise<number> {
  if (childIds.length === 0) return 0;
  return prisma.friendParentApproval.count({ where: { childId: { in: childIds }, approvedAt: null, request: { status: "PARENT_REVIEW" } } });
}

export async function respondToFriendReview(parentId: string, childId: string, requestId: string, approve: boolean): Promise<void> {
  await assertParentOf(parentId, childId);
  const approval = await prisma.friendParentApproval.findUnique({ where: { requestId_childId: { requestId, childId } }, include: { request: true } });
  if (!approval || approval.request.status !== "PARENT_REVIEW" || approval.approvedAt) throw new FriendReviewError("That request was already answered.");

  if (!approve) {
    await prisma.friendRequest.update({ where: { id: requestId }, data: { status: "REJECTED", respondedAt: new Date() } });
    await prisma.friendParentApproval.deleteMany({ where: { requestId } });
    return;
  }

  const claimed = await prisma.friendParentApproval.updateMany({ where: { requestId, childId, approvedAt: null }, data: { approvedAt: new Date(), parentId } });
  if (claimed.count !== 1) return;
  const stillWaiting = await prisma.friendParentApproval.count({ where: { requestId, approvedAt: null } });
  if (stillWaiting > 0) return; // the other child's parent still has to approve
  const request = await prisma.friendRequest.findUnique({ where: { id: requestId }, select: { status: true } });
  if (request?.status === "PARENT_REVIEW") await finalizeFriendship(requestId);
  await createNotification({
    userId: childId,
    type: "FRIEND_REQUEST_ACCEPTED",
    title: "Your parent approved a friend",
    body: "A friend request your parent looked at was approved. You are friends now.",
    emailCategory: "social",
  }).catch(() => undefined);
}

export async function listChildFriends(parentId: string, childId: string): Promise<ChildFriendRow[]> {
  await assertParentOf(parentId, childId);
  const rows = await prisma.friendRequest.findMany({
    where: { status: "ACCEPTED", OR: [{ senderId: childId }, { receiverId: childId }] },
    include: { sender: who, receiver: who },
    orderBy: { respondedAt: "desc" },
  });
  return rows.map((r) => {
    const other = r.senderId === childId ? r.receiver : r.sender;
    return { requestId: r.id, userId: other.id, name: other.name?.split(" ")[0] ?? "Friend", username: other.username };
  });
}

/** A parent removes one of their child's friends. The friendship is deleted outright (the other person is not told it was the parent). */
export async function removeChildFriend(parentId: string, childId: string, requestId: string): Promise<void> {
  await assertParentOf(parentId, childId);
  const removed = await prisma.friendRequest.deleteMany({ where: { id: requestId, status: "ACCEPTED", OR: [{ senderId: childId }, { receiverId: childId }] } });
  if (removed.count !== 1) throw new FriendReviewError("That friend is no longer in the list.");
}
