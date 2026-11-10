import { afterAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerSession: async () => null, getServerAuthSession: async () => null, authOptions: {} }));
import { listSentAdminMessages, openSupportCaseFromMail, sendAdminMessage } from "@/lib/mail";
import { makeUser, newTag, prisma } from "./helpers";

const tag = newTag("sr");
const userIds: string[] = [];

afterAll(async () => {
  await prisma.assistantEscalation.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.mailMessage.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.rateLimitEvent.deleteMany({ where: { OR: userIds.map((id) => ({ key: { contains: id } })) } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
});

describe("Inbox > Messages history", () => {
  it("shows Replied, with the support case, once the student answers a message", async () => {
    const admin = await makeUser(tag, "Teacher", { role: "ADMIN" });
    const student = await makeUser(tag, "Reply Student");
    userIds.push(admin.id, student.id);
    const { mailId } = await sendAdminMessage(admin.id, student.id, `About class ${tag}`, "See you Tuesday.", { sendEmail: false, supportCta: true });

    let row = (await listSentAdminMessages()).find((m) => m.id === mailId);
    expect(row?.supportCaseId).toBeNull();

    const { escalationId } = await openSupportCaseFromMail(student.id, mailId);
    row = (await listSentAdminMessages()).find((m) => m.id === mailId);
    expect(row?.supportCaseId).toBe(escalationId);

    // A case deleted for good is not linked to.
    await prisma.assistantEscalation.delete({ where: { id: escalationId } });
    row = (await listSentAdminMessages()).find((m) => m.id === mailId);
    expect(row?.supportCaseId).toBeNull();
  });
});
