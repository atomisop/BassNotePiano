import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
// A signed-in person's thread only answers to their own session (loadEscalationForVisitor), so the test signs in as whoever sends.
const current = vi.hoisted(() => ({ id: "" }));
vi.mock("@/lib/auth", () => ({ getServerAuthSession: async () => (current.id ? { user: { id: current.id, role: "STUDENT" } } : null), authOptions: {} }));
import { getSupportChat, getSupportUnreadCount, markSupportChatRead, sendSupportChatMessage } from "@/lib/messagesSupport";
import { postAdminReply } from "@/lib/support";
import { makeUser, newTag, prisma } from "./helpers";

const tag = newTag("ms");
let admin: { id: string }, a: { id: string }, b: { id: string };

beforeAll(async () => {
  admin = await makeUser(tag, "Teacher", { role: "ADMIN" });
  a = await makeUser(tag, "Ann Student");
  b = await makeUser(tag, "Bo Student");
});
afterAll(async () => {
  await prisma.assistantEscalation.deleteMany({ where: { userId: { in: [a.id, b.id] } } });
  await prisma.notification.deleteMany({ where: { userId: { in: [admin.id, a.id, b.id] } } });
  await prisma.appSetting.deleteMany({ where: { key: { in: [`support-read:${a.id}`, `support-read:${b.id}`] } } });
  await prisma.rateLimit?.deleteMany?.({ where: { key: { contains: a.id } } }).catch(() => undefined);
  await prisma.user.deleteMany({ where: { id: { in: [admin.id, a.id, b.id] } } });
});

describe("the Support conversation in Messages", () => {
  it("starts a thread on the first message, joins it after, and notifies the team once", async () => {
    current.id = a.id;
    await sendSupportChatMessage(a.id, "Hello, can I change my class day?");
    await sendSupportChatMessage(a.id, "Also my payment.");
    const threads = await prisma.assistantEscalation.findMany({ where: { userId: a.id } });
    expect(threads).toHaveLength(1);
    const chat = await getSupportChat(a.id);
    expect(chat.messages.filter((m) => m.mine).map((m) => m.body)).toEqual(["Hello, can I change my class day?", "Also my payment."]);
    expect(chat.open).toBe(true);
  });
  it("shows the team's replies as unread until read, and never shows internal notes", async () => {
    const thread = await prisma.assistantEscalation.findFirstOrThrow({ where: { userId: a.id } });
    await postAdminReply(thread.id, admin.id, "Sure, which day?");
    await prisma.supportMessage.create({ data: { escalationId: thread.id, sender: "INTERNAL", body: "secret note" } });
    expect(await getSupportUnreadCount(a.id)).toBe(1);
    const chat = await getSupportChat(a.id);
    expect(chat.unread).toBe(1);
    expect(chat.messages.some((m) => m.body === "secret note")).toBe(false);
    await markSupportChatRead(a.id);
    expect(await getSupportUnreadCount(a.id)).toBe(0);
  });
  it("keeps each person's conversation to themselves", async () => {
    expect((await getSupportChat(b.id)).messages).toHaveLength(0);
    current.id = b.id;
    await sendSupportChatMessage(b.id, "Hi from Bo");
    expect((await getSupportChat(a.id)).messages.some((m) => m.body === "Hi from Bo")).toBe(false);
  });
  it("refuses empty and over-long messages", async () => {
    await expect(sendSupportChatMessage(a.id, "   ")).rejects.toThrow();
    await expect(sendSupportChatMessage(a.id, "x".repeat(2001))).rejects.toThrow();
  });
});
