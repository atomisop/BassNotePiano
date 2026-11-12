import { afterAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerAuthSession: async () => null, getServerSession: async () => null, authOptions: {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
import { sendFriendRequest, respondToFriendRequest, isFriend } from "@/lib/social";
import { childAccountBlock, endParentLink } from "@/lib/parentLinks";
import { listChildFriends, listReviewsForChild, removeChildFriend, respondToFriendReview } from "@/lib/friendParentReview";
import { makeUser, newTag, prisma } from "./helpers";

// A child account (an accepted parent link) is managed by its parent: it cannot end the link, and its friendships wait for a parent.
const tag = newTag("kid");
const ids: string[] = [];
let n = 0;
async function person(name: string) {
  const u = await makeUser(tag, name, { emailVerified: new Date(), username: `${tag.replace(/\W/g, "").slice(0, 8)}${(n++).toString(36)}`.toLowerCase() });
  ids.push(u.id);
  return u as typeof u & { username: string };
}
const link = (parentId: string, childId: string, status: "ACCEPTED" | "PENDING" = "ACCEPTED") => prisma.parentLink.create({ data: { parentId, childId, status } });

afterAll(async () => {
  await prisma.friendParentApproval.deleteMany({ where: { childId: { in: ids } } });
  await prisma.friendRequest.deleteMany({ where: { OR: [{ senderId: { in: ids } }, { receiverId: { in: ids } }] } });
  await prisma.parentLink.deleteMany({ where: { OR: [{ parentId: { in: ids } }, { childId: { in: ids } }] } });
  await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
});

describe("a child cannot end the parent link", () => {
  it("is refused once accepted, while the parent can end it", async () => {
    const parent = await person("Pa");
    const child = await person("Ch");
    await link(parent.id, child.id);
    await expect(endParentLink(child.id, parent.id)).rejects.toThrow(/Only your parent/);
    expect(await prisma.parentLink.count({ where: { parentId: parent.id, childId: child.id, status: "ACCEPTED" } })).toBe(1);
    await endParentLink(parent.id, child.id);
    expect(await prisma.parentLink.count({ where: { parentId: parent.id, childId: child.id } })).toBe(0);
  });

  it("a child can still turn down a request that is only waiting", async () => {
    const parent = await person("Pa2");
    const child = await person("Ch2");
    await link(parent.id, child.id, "PENDING");
    await endParentLink(child.id, parent.id);
    expect((await prisma.parentLink.findFirstOrThrow({ where: { parentId: parent.id, childId: child.id } })).status).toBe("DECLINED");
  });

  it("the account rules only block a linked child", async () => {
    const parent = await person("Pa3");
    const child = await person("Ch3");
    const adult = await person("Ad3");
    await link(parent.id, child.id);
    expect(await childAccountBlock(child.id)).toMatchObject({ ok: false });
    expect(await childAccountBlock(adult.id)).toBeNull();
    expect(await childAccountBlock(parent.id)).toBeNull();
  });
});

describe("a child's friendships wait for a parent", () => {
  it("does not start until a linked parent approves, then it does", async () => {
    const parent = await person("Pa4");
    const child = await person("Ch4");
    const friend = await person("Fr4");
    await link(parent.id, child.id);
    const sent = await sendFriendRequest(friend.id, child.username);
    const after = await respondToFriendRequest(child.id, sent.id, true);
    expect(after.status).toBe("PARENT_REVIEW");
    expect(await isFriend(child.id, friend.id)).toBe(false);
    expect(await prisma.notification.count({ where: { userId: parent.id, type: "FRIEND_PARENT_REVIEW" } })).toBe(1);
    expect(await listReviewsForChild(parent.id, child.id)).toHaveLength(1);

    const stranger = await person("St4");
    await expect(respondToFriendReview(stranger.id, child.id, sent.id, true)).rejects.toThrow(/not linked/);
    expect(await isFriend(child.id, friend.id)).toBe(false);

    await respondToFriendReview(parent.id, child.id, sent.id, true);
    expect(await isFriend(child.id, friend.id)).toBe(true);
    expect(await listChildFriends(parent.id, child.id)).toHaveLength(1);
  });

  it("a parent declining ends it", async () => {
    const parent = await person("Pa5");
    const child = await person("Ch5");
    const friend = await person("Fr5");
    await link(parent.id, child.id);
    const sent = await sendFriendRequest(friend.id, child.username);
    await respondToFriendRequest(child.id, sent.id, true);
    await respondToFriendReview(parent.id, child.id, sent.id, false);
    expect(await isFriend(child.id, friend.id)).toBe(false);
    expect((await prisma.friendRequest.findUniqueOrThrow({ where: { id: sent.id } })).status).toBe("REJECTED");
  });

  it("when both people are children, both parents must approve", async () => {
    const parentA = await person("PaA");
    const parentB = await person("PaB");
    const kidA = await person("KidA");
    const kidB = await person("KidB");
    await link(parentA.id, kidA.id);
    await link(parentB.id, kidB.id);
    const sent = await sendFriendRequest(kidA.id, kidB.username);
    await respondToFriendRequest(kidB.id, sent.id, true);
    await respondToFriendReview(parentA.id, kidA.id, sent.id, true);
    expect(await isFriend(kidA.id, kidB.id)).toBe(false);
    await respondToFriendReview(parentB.id, kidB.id, sent.id, true);
    expect(await isFriend(kidA.id, kidB.id)).toBe(true);
  });

  it("a parent can remove one of their child's friends, and only their child's", async () => {
    const parent = await person("Pa6");
    const child = await person("Ch6");
    const friend = await person("Fr6");
    await link(parent.id, child.id);
    const sent = await sendFriendRequest(friend.id, child.username);
    await respondToFriendRequest(child.id, sent.id, true);
    await respondToFriendReview(parent.id, child.id, sent.id, true);
    const other = await person("Oth6");
    await expect(removeChildFriend(other.id, child.id, sent.id)).rejects.toThrow(/not linked/);
    await removeChildFriend(parent.id, child.id, sent.id);
    expect(await isFriend(child.id, friend.id)).toBe(false);
  });

  it("two adults become friends right away, as before", async () => {
    const a = await person("Ad7");
    const b = await person("Ad8");
    const sent = await sendFriendRequest(a.id, b.username);
    const after = await respondToFriendRequest(b.id, sent.id, true);
    expect(after.status).toBe("ACCEPTED");
    expect(await isFriend(a.id, b.id)).toBe(true);
  });
});
