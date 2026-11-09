import { afterAll, describe, expect, it, vi } from "vitest";
import { canonicalEmail } from "@/lib/canonicalEmail";
import { newTag, prisma } from "./helpers";

// Accept and Decline right on the bell entry, for a friend request, a parent link request and a group plan invitation, through the same
// functions their own pages use. And a mail row in the bell opens its button's page directly.
const who = vi.hoisted(() => ({ id: "", email: "" }));
vi.mock("@/lib/auth", () => ({ getServerAuthSession: async () => (who.id ? { user: { id: who.id, email: who.email, role: "STUDENT" } } : null), getServerSession: async () => null, authOptions: {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

import { answerFromBellAction, fetchNotificationsAction } from "@/app/(dashboard)/notification-actions";
import { sendFriendRequest, setUsername } from "@/lib/social";
import { sendParentLink } from "@/lib/parentLinks";
import { sendFamilyInvite } from "@/lib/familyInvites";
import { createNotification } from "@/lib/notifications";
import { resetRateLimitBackend } from "@/lib/rateLimit";

const tag = newTag("ba");
const userIds: string[] = [];
async function account(label: string, name: string) {
  const email = `${tag}-${label}@example.test`;
  const u = await prisma.user.create({ data: { email, name, passwordHash: "x", emailCanonical: canonicalEmail(email) } });
  userIds.push(u.id);
  return u;
}
const signInAs = (u: { id: string; email: string }) => Object.assign(who, { id: u.id, email: u.email });

afterAll(async () => {
  await prisma.friendRequest.deleteMany({ where: { OR: [{ senderId: { in: userIds } }, { receiverId: { in: userIds } }] } });
  await prisma.parentLink.deleteMany({ where: { OR: [{ parentId: { in: userIds } }, { childId: { in: userIds } }] } });
  await prisma.familyInvite.deleteMany({ where: { OR: [{ payerId: { in: userIds } }, { inviteeId: { in: userIds } }] } });
  await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.mailMessage.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.userBadge.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
});

describe("answering from the bell", () => {
  it("a friend request: Accept on the entry makes the friendship and marks the entry read", async () => {
    resetRateLimitBackend();
    const sender = await account("fs", "Sender Tester");
    const me = await account("fr", "Receiver Tester");
    const username = `ba${Date.now() % 1_000_000}`;
    await setUsername(me.id, username);
    await sendFriendRequest(sender.id, username);

    signInAs(me);
    const { notifications } = await fetchNotificationsAction();
    const entry = notifications.find((n) => n.type === "FRIEND_REQUEST_RECEIVED")!;
    expect(entry.answer).toEqual({ kind: "friend", state: "PENDING" });

    expect(await answerFromBellAction(entry.id, true)).toEqual({ ok: true, state: "ACCEPTED" });
    expect((await prisma.friendRequest.findFirstOrThrow({ where: { senderId: sender.id, receiverId: me.id } })).status).toBe("ACCEPTED");
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: entry.id } })).readAt).not.toBeNull();
    const again = (await fetchNotificationsAction()).notifications.find((n) => n.id === entry.id)!;
    expect(again.answer?.state).toBe("ACCEPTED");
    // Answered once: a second tap is refused with the plain reason.
    expect(await answerFromBellAction(entry.id, false)).toMatchObject({ ok: false });
  });

  it("a parent link request: Decline on the entry", async () => {
    resetRateLimitBackend();
    const parent = await account("pp", "Parent Tester");
    const me = await account("pc", "Kiddo Tester");
    await sendParentLink(parent.id, me.email);
    signInAs(me);
    const entry = (await fetchNotificationsAction()).notifications.find((n) => n.type === "PARENT_LINK_REQUEST")!;
    expect(entry.answer).toEqual({ kind: "parent", state: "PENDING" });
    expect(await answerFromBellAction(entry.id, false)).toEqual({ ok: true, state: "DECLINED" });
    expect((await prisma.parentLink.findFirstOrThrow({ where: { parentId: parent.id, childId: me.id } })).status).toBe("DECLINED");
  });

  it("a group plan invitation: in the bell (not Mail), and the payer's 'accepted' notice opens the form on the length they picked", async () => {
    resetRateLimitBackend();
    const payer = await account("gp", "Payer Tester");
    const me = await account("gi", "Member Tester");
    await sendFamilyInvite(payer.id, me.email, { term: "TERM_3" });
    expect(await prisma.mailMessage.count({ where: { userId: me.id } })).toBe(0);
    signInAs(me);
    const entry = (await fetchNotificationsAction()).notifications.find((n) => n.type === "GROUP_INVITE")!;
    expect(entry.body).not.toMatch(/Open Billing/);
    expect(entry.answer).toEqual({ kind: "group", state: "PENDING" });
    expect(await answerFromBellAction(entry.id, true)).toEqual({ ok: true, state: "ACCEPTED" });

    signInAs(payer);
    const { mail } = await fetchNotificationsAction();
    const accepted = mail.find((m) => m.title === "Group invitation accepted")!;
    // Straight from the bell to the plan form, on the same plan length.
    expect(accepted.href).toBe("/billing/plans?who=family&term=TERM_3");
  });

  it("someone else's entry cannot be answered", async () => {
    resetRateLimitBackend();
    const parent = await account("xp", "Parent Tester");
    const child = await account("xc", "Kiddo Tester");
    const stranger = await account("xs", "Other Tester");
    await sendParentLink(parent.id, child.email);
    const notice = await prisma.notification.findFirstOrThrow({ where: { userId: child.id, type: "PARENT_LINK_REQUEST" } });
    signInAs(stranger);
    expect(await answerFromBellAction(notice.id, true)).toMatchObject({ ok: false });
    expect((await prisma.parentLink.findFirstOrThrow({ where: { parentId: parent.id, childId: child.id } })).status).toBe("PENDING");
  });

  it("a mail row without a button still opens the message", async () => {
    const me = await account("m", "Mail Tester");
    await createNotification({ userId: me.id, type: "PAYMENT_PLAN_UPDATED", title: "With button", body: "x", cta: { label: "Open", path: "/billing/plans" } });
    await prisma.mailMessage.create({ data: { userId: me.id, kind: "ADMIN_MESSAGE", title: "Plain", body: "y" } });
    signInAs(me);
    const { mail } = await fetchNotificationsAction();
    expect(mail.find((m) => m.title === "With button")?.href).toBe("/billing/plans");
    expect(mail.find((m) => m.title === "Plain")?.href).toMatch(/^\/mail\//);
  });
});
