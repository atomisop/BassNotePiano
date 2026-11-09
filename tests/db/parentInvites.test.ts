import { afterAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerSession: async () => null, getServerAuthSession: async () => null, authOptions: {} }));
import { canonicalEmail } from "@/lib/canonicalEmail";
import { cancelParentLinkByEmail, claimParentInvites, listLinksFromParent, MAX_LINKED_CHILDREN, PARENT_INVITE_DAYS, sendParentLink } from "@/lib/parentLinks";
import { answerIdFrom } from "@/lib/bellAnswers";
import { resetRateLimitBackend } from "@/lib/rateLimit";
import { newTag, prisma } from "./helpers";

// A parent who asks for a child's email before the child has an account: the request is remembered and reaches the child once they sign
// up and confirm their email, so nobody has to come back and ask again.
const tag = newTag("pi");
const userIds: string[] = [];

async function account(label: string, name: string, extra: Record<string, unknown> = {}) {
  const email = `${tag}-${label}@example.test`;
  const u = await prisma.user.create({ data: { email, name, passwordHash: "x", emailCanonical: canonicalEmail(email), ...extra } });
  userIds.push(u.id);
  return u;
}

afterAll(async () => {
  await prisma.parentLinkInvite.deleteMany({ where: { OR: [{ parentId: { in: userIds } }, { email: { startsWith: tag } }] } });
  await prisma.parentLink.deleteMany({ where: { OR: [{ parentId: { in: userIds } }, { childId: { in: userIds } }] } });
  await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
  await prisma.appSetting.deleteMany({ where: { key: { startsWith: "register-invite:" } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
});

describe("asking for a child who has no account yet", () => {
  it("answers exactly like a request to an existing account, and remembers the email", async () => {
    resetRateLimitBackend();
    const parent = await account("p1", "Parent Tester");
    const existing = await account("kid-existing", "Kiddo Tester");
    const missing = `${tag}-kid-new@example.test`;
    expect(await sendParentLink(parent.id, existing.email)).toBe("PENDING");
    expect(await sendParentLink(parent.id, ` ${missing.toUpperCase()} `)).toBe("PENDING");
    // Nothing exists for the missing email but the remembered request; no link, nobody told.
    expect(await prisma.parentLinkInvite.count({ where: { parentId: parent.id, email: missing } })).toBe(1);
    const rows = await listLinksFromParent(parent.id);
    expect(rows.find((r) => r.email === missing)).toMatchObject({ status: "PENDING", awaitingAccount: true, childId: "" });
    expect(rows.find((r) => r.childId === existing.id)).toMatchObject({ status: "PENDING" });
  });

  it("reaches the child only after their account exists AND its email is confirmed, once", async () => {
    resetRateLimitBackend();
    const parent = await account("p2", "Parent Tester");
    const email = `${tag}-kid2@example.test`;
    await sendParentLink(parent.id, email);

    const kid = await account("kid2", "Kiddo Tester");
    expect(kid.email).toBe(email);
    expect(await claimParentInvites(kid.id, kid.email)).toBe(0);
    expect(await prisma.parentLink.count({ where: { childId: kid.id } })).toBe(0);

    await prisma.user.update({ where: { id: kid.id }, data: { emailVerified: new Date() } });
    expect(await claimParentInvites(kid.id, kid.email)).toBe(1);
    const link = await prisma.parentLink.findFirstOrThrow({ where: { parentId: parent.id, childId: kid.id } });
    expect(link.status).toBe("PENDING");
    // The child's notice carries the request, so the bell can show Accept and Decline on it.
    const notice = await prisma.notification.findFirstOrThrow({ where: { userId: kid.id, type: "PARENT_LINK_REQUEST" } });
    expect(answerIdFrom(notice.href)).toBe(link.id);
    // Used once: nothing is left to claim, and asking again later does not duplicate it.
    expect(await prisma.parentLinkInvite.count({ where: { email } })).toBe(0);
    expect(await claimParentInvites(kid.id, kid.email)).toBe(0);
    expect(await prisma.notification.count({ where: { userId: kid.id, type: "PARENT_LINK_REQUEST" } })).toBe(1);
  });

  it("another account cannot claim a request meant for a different email", async () => {
    resetRateLimitBackend();
    const parent = await account("p3", "Parent Tester");
    const email = `${tag}-kid3@example.test`;
    await sendParentLink(parent.id, email);
    const other = await account("other3", "Other Tester", { emailVerified: new Date() });
    expect(await claimParentInvites(other.id, email)).toBe(0);
    expect(await prisma.parentLinkInvite.count({ where: { email } })).toBe(1);
  });

  it("can be withdrawn, and an old one is never used", async () => {
    resetRateLimitBackend();
    const parent = await account("p4", "Parent Tester");
    const email = `${tag}-kid4@example.test`;
    await sendParentLink(parent.id, email);
    await cancelParentLinkByEmail(parent.id, email);
    expect(await prisma.parentLinkInvite.count({ where: { parentId: parent.id } })).toBe(0);

    const stale = `${tag}-kid5@example.test`;
    await prisma.parentLinkInvite.create({ data: { parentId: parent.id, email: stale, createdAt: new Date(Date.now() - (PARENT_INVITE_DAYS + 1) * 86_400_000) } });
    const kid = await account("kid5", "Kiddo Tester", { emailVerified: new Date() });
    expect(kid.email).toBe(stale);
    expect(await claimParentInvites(kid.id, kid.email)).toBe(0);
    expect(await prisma.parentLink.count({ where: { childId: kid.id } })).toBe(0);
  });

  it("stores nothing for an address that is a banned or admin account, but answers the same", async () => {
    resetRateLimitBackend();
    const parent = await account("p6", "Parent Tester");
    const banned = await account("banned6", "Banned Tester", { bannedAt: new Date() });
    const admin = await account("admin6", "Admin Tester", { role: "ADMIN" });
    expect(await sendParentLink(parent.id, banned.email)).toBe("PENDING");
    expect(await sendParentLink(parent.id, admin.email)).toBe("PENDING");
    expect(await prisma.parentLinkInvite.count({ where: { parentId: parent.id } })).toBe(0);
    expect(await prisma.parentLink.count({ where: { parentId: parent.id } })).toBe(0);
  });

  it("remembered emails count toward the most children a parent can link", async () => {
    resetRateLimitBackend();
    const parent = await account("p7", "Parent Tester");
    for (let i = 0; i < MAX_LINKED_CHILDREN; i++) {
      await prisma.parentLinkInvite.create({ data: { parentId: parent.id, email: `${tag}-cap${i}@example.test` } });
    }
    await expect(sendParentLink(parent.id, `${tag}-cap-extra@example.test`)).rejects.toThrow(/up to/);
  });

  it("is still limited before it answers, so it cannot list which emails have accounts", async () => {
    resetRateLimitBackend();
    const parent = await account("p8", "Parent Tester");
    let refused = 0;
    for (let i = 0; i < 30; i++) {
      await sendParentLink(parent.id, `${tag}-probe${i}@example.test`).catch((e: Error) => {
        if (/Too many|up to/i.test(e.message)) refused++;
      });
    }
    expect(refused).toBeGreaterThan(0);
  });
});
