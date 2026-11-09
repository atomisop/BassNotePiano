import { afterAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerSession: async () => null, getServerAuthSession: async () => null, authOptions: {} }));
import { canonicalEmail } from "@/lib/canonicalEmail";
import { askToBookTogether, blockUser } from "@/lib/social";
import { answerIdFrom } from "@/lib/bellAnswers";
import { resetRateLimitBackend } from "@/lib/rateLimit";
import { newTag, prisma } from "./helpers";

// "Ask to book together" on the family class form: a friend request by email in place, worded the same whether or not the email has an
// account (no account gets the invitation to make one). The booking itself still needs the friendship, as before.
const tag = newTag("at");
const userIds: string[] = [];
async function account(label: string, name: string, extra: Record<string, unknown> = {}) {
  const email = `${tag}-${label}@example.test`;
  const u = await prisma.user.create({ data: { email, name, passwordHash: "x", emailCanonical: canonicalEmail(email), ...extra } });
  userIds.push(u.id);
  return u;
}

afterAll(async () => {
  await prisma.block.deleteMany({ where: { OR: [{ blockerId: { in: userIds } }, { blockedId: { in: userIds } }] } });
  await prisma.friendRequest.deleteMany({ where: { OR: [{ senderId: { in: userIds } }, { receiverId: { in: userIds } }] } });
  await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
  await prisma.appSetting.deleteMany({ where: { key: { startsWith: "register-invite:" } } });
  await prisma.userBadge.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
});

describe("asking to book together", () => {
  it("gives the same answer for an account, an email with no account, a blocked person and an admin", async () => {
    resetRateLimitBackend();
    const me = await account("me", "Asker Tester");
    const friend = await account("friend", "Friend Tester");
    const blocked = await account("blocked", "Blocked Tester");
    const admin = await account("admin", "Admin Tester", { role: "ADMIN" });
    await blockUser(blocked.id, me.id);
    for (const email of [friend.email, `${tag}-nobody@example.test`, blocked.email, admin.email]) {
      expect(await askToBookTogether(me.id, email)).toBe("asked");
    }
    // Only the real, unblocked student got a request, and its notice carries Accept and Decline for the bell.
    const request = await prisma.friendRequest.findFirstOrThrow({ where: { senderId: me.id, receiverId: friend.id } });
    expect(request.status).toBe("PENDING");
    const notice = await prisma.notification.findFirstOrThrow({ where: { userId: friend.id, type: "FRIEND_REQUEST_RECEIVED" } });
    expect(answerIdFrom(notice.href)).toBe(request.id);
    expect(notice.body).toMatch(/book classes together/);
    expect(await prisma.friendRequest.count({ where: { senderId: me.id, receiverId: { in: [blocked.id, admin.id] } } })).toBe(0);
    // The email with no account was sent the invitation to make one.
    expect(await prisma.auditLog.count({ where: { actorId: me.id, action: "invite.register" } })).toBe(1);
  });

  it("does not tell the same person twice while they have not answered", async () => {
    resetRateLimitBackend();
    const me = await account("me2", "Asker Tester");
    const friend = await account("friend2", "Friend Tester");
    await askToBookTogether(me.id, friend.email);
    await askToBookTogether(me.id, friend.email);
    expect(await prisma.notification.count({ where: { userId: friend.id, type: "FRIEND_REQUEST_RECEIVED" } })).toBe(1);
  });

  it("is limited before anything is looked up, with one message whatever the address", async () => {
    resetRateLimitBackend();
    const me = await account("me3", "Asker Tester");
    const messages = new Set<string>();
    for (let i = 0; i < 14; i++) {
      await askToBookTogether(me.id, `${tag}-probe${i}@example.test`).catch((e: Error) => messages.add(e.message));
    }
    expect(messages.size).toBe(1);
    expect([...messages][0]).toMatch(/try again tomorrow/);
  });
});
