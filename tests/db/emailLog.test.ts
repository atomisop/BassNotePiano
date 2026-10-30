import { afterAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerAuthSession: async () => null, authOptions: {} }));
import { purgeOldEmailLogs, recordEmail } from "@/lib/emailLog";
import { sendEmailIfEnabled } from "@/lib/notifications";
import { makeUser, newTag, prisma } from "./helpers";

const tag = newTag("el");
const ids: string[] = [];

afterAll(async () => {
  await prisma.emailLog.deleteMany({ where: { OR: [{ userId: { in: ids } }, { to: { contains: tag } }] } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
});

describe("email records", () => {
  it("links an email to the account by its address, whatever the letter case", async () => {
    const u = await makeUser(`${tag}a`, "Email Student");
    ids.push(u.id);
    await recordEmail({ to: u.email.toUpperCase(), subject: `Hello ${tag}`, status: "SENT", resendId: `re_${tag}` });
    const row = await prisma.emailLog.findUniqueOrThrow({ where: { resendId: `re_${tag}` } });
    expect(row.userId).toBe(u.id);
    expect(row.status).toBe("SENT");
  });

  it("records an email to someone with no account without one", async () => {
    await recordEmail({ to: `nobody-${tag}@example.test`, subject: "Your application", status: "SENT" });
    const row = await prisma.emailLog.findFirstOrThrow({ where: { to: `nobody-${tag}@example.test` } });
    expect(row.userId).toBeNull();
  });

  it("records an email skipped because the person switched that kind off, with the switch's name", async () => {
    const u = await makeUser(`${tag}b`, "Quiet Student", { notifyEmailSocial: false });
    ids.push(u.id);
    await sendEmailIfEnabled(u.id, "social", `New message ${tag}`);
    const row = await prisma.emailLog.findFirstOrThrow({ where: { userId: u.id, subject: `New message ${tag}` } });
    expect(row.status).toBe("SKIPPED");
    expect(row.detail).toContain("Social");
  });

  it("removes records older than 180 days and keeps newer ones", async () => {
    const old = await prisma.emailLog.create({ data: { to: `old-${tag}@example.test`, subject: "Old", status: "SENT", createdAt: new Date(Date.now() - 200 * 86_400_000) } });
    const fresh = await prisma.emailLog.create({ data: { to: `new-${tag}@example.test`, subject: "New", status: "SENT" } });
    await purgeOldEmailLogs();
    expect(await prisma.emailLog.findUnique({ where: { id: old.id } })).toBeNull();
    expect(await prisma.emailLog.findUnique({ where: { id: fresh.id } })).not.toBeNull();
  });
});
