import { afterAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerSession: async () => null, getServerAuthSession: async () => null, authOptions: {} }));
import { canonicalEmail } from "@/lib/canonicalEmail";
import { AccountToolError, listLiveCreditGrants, setCreditGrantExpiry, setTrialFor, updateAccountDetails } from "@/lib/adminAccountTools";
import { newTag, prisma } from "./helpers";

const tag = newTag("aat");
const emails: string[] = [];

async function account(label: string, role: "STUDENT" | "ADMIN" = "STUDENT", phone: string | null = null) {
  const email = `${tag}-${label}-${emails.length}@example.test`;
  emails.push(email);
  return prisma.user.create({ data: { email, name: "Sam Tester", passwordHash: "x", emailCanonical: canonicalEmail(email), role, phone, emailVerified: new Date() } });
}

afterAll(async () => {
  const users = await prisma.user.findMany({ where: { OR: [{ email: { in: emails } }, { email: { startsWith: tag } }] }, select: { id: true } });
  const ids = users.map((u) => u.id);
  await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
  await prisma.creditGrant.deleteMany({ where: { userId: { in: ids } } });
  await prisma.auditLog.deleteMany({ where: { actorId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
});

describe("the studio's account fixes", () => {
  it("changes the name, email and phone, marks the new email unverified, and tells the student once", async () => {
    const admin = await account("admin", "ADMIN");
    const student = await account("student");
    const newEmail = `${tag}-renamed@example.test`;
    const what = await updateAccountDetails(admin.id, student.id, { name: "  Kokeb   Kebret ", email: newEmail.toUpperCase(), phone: "(212) 555-7788" });
    expect(what).toBe("name, email and phone number");
    const after = await prisma.user.findUniqueOrThrow({ where: { id: student.id } });
    expect(after.name).toBe("Kokeb Kebret");
    expect(after.email).toBe(newEmail);
    expect(after.emailVerified).toBeNull();
    expect(after.phone).toBe("+12125557788");
    expect(after.sessionVersion).toBe(student.sessionVersion + 1);
    expect(await prisma.notification.count({ where: { userId: student.id, type: "ACCOUNT_UPDATE" } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: "user.details", targetId: student.id } })).toBe(1);
    expect(await updateAccountDetails(admin.id, student.id, { name: "Kokeb Kebret", email: newEmail, phone: "+12125557788" })).toBeNull();
  });

  it("refuses a one-word name, a taken email and a taken phone", async () => {
    const admin = await account("admin", "ADMIN");
    const a = await account("a");
    const b = await account("b", "STUDENT", "+12125557799");
    await expect(updateAccountDetails(admin.id, a.id, { name: "Cher", email: a.email, phone: "" })).rejects.toBeInstanceOf(AccountToolError);
    await expect(updateAccountDetails(admin.id, a.id, { name: "Sam Tester", email: b.email, phone: "" })).rejects.toThrow(/already uses that email/);
    await expect(updateAccountDetails(admin.id, a.id, { name: "Sam Tester", email: a.email, phone: "212 555 7799" })).rejects.toThrow(/already uses that phone/);
  });

  it("gives, extends and ends a free trial", async () => {
    const admin = await account("admin", "ADMIN");
    const student = await account("trial");
    const until = await setTrialFor(admin.id, student.id, 7);
    expect(until!.getTime()).toBeGreaterThan(Date.now() + 6.9 * 86_400_000);
    await setTrialFor(admin.id, student.id, 0);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: student.id } })).trialEndsAt!.getTime()).toBeLessThanOrEqual(Date.now());
    await expect(setTrialFor(admin.id, student.id, 0)).rejects.toThrow(/no running trial/);
    await expect(setTrialFor(admin.id, admin.id, 7)).rejects.toThrow(/admin/);
  });

  it("moves when a batch of credits expires, or makes it never expire, and resets the warning", async () => {
    const admin = await account("admin", "ADMIN");
    const student = await account("credits");
    const grant = await prisma.creditGrant.create({ data: { userId: student.id, source: "ADMIN_ADJUSTMENT", creditsGranted: 4, creditsRemaining: 4, expiresAt: new Date(Date.now() + 3 * 86_400_000), expiringSoonNotifiedAt: new Date() } });
    expect((await listLiveCreditGrants(student.id)).map((g) => g.id)).toEqual([grant.id]);
    const later = new Date(Date.now() + 40 * 86_400_000).toISOString().slice(0, 10);
    await setCreditGrantExpiry(admin.id, student.id, grant.id, later);
    let after = await prisma.creditGrant.findUniqueOrThrow({ where: { id: grant.id } });
    expect(after.expiresAt!.getTime()).toBeGreaterThan(Date.now() + 38 * 86_400_000);
    expect(after.expiringSoonNotifiedAt).toBeNull();
    await setCreditGrantExpiry(admin.id, student.id, grant.id, null);
    after = await prisma.creditGrant.findUniqueOrThrow({ where: { id: grant.id } });
    expect(after.expiresAt).toBeNull();
    await expect(setCreditGrantExpiry(admin.id, student.id, grant.id, "2020-01-01")).rejects.toThrow(/after today/);
    await expect(setCreditGrantExpiry(admin.id, admin.id, grant.id, later)).rejects.toThrow(/already used/);
  });
});
