import { afterAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerSession: async () => null, getServerAuthSession: async () => null, authOptions: {} }));
import { canonicalEmail } from "@/lib/canonicalEmail";
import { addStaff, findStaffCandidate } from "@/lib/staffAdd";
import { newTag, prisma } from "./helpers";

const tag = newTag("stf");
const emails: string[] = [];

async function account(label: string, extra: Record<string, unknown> = {}) {
  const email = `${tag}-${label}@example.test`;
  emails.push(email);
  return prisma.user.create({ data: { email, name: `${label} Tester`, passwordHash: "x", emailCanonical: canonicalEmail(email), emailVerified: new Date(), ...extra } });
}

afterAll(async () => {
  const users = await prisma.user.findMany({ where: { email: { in: emails } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  await prisma.auditLog.deleteMany({ where: { actorId: { in: ids } } });
  await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
});

describe("Add staff", () => {
  it("shows the account for an email, then makes it staff through the audited role change", async () => {
    const owner = await account("owner", { role: "ADMIN" });
    const helper = await account("helper");
    const found = await findStaffCandidate(`  ${helper.email.toUpperCase()} `);
    expect(found).toMatchObject({ ok: true, account: { id: helper.id, email: helper.email, onPlan: false } });

    expect(await addStaff({ id: owner.id, email: owner.email }, helper.id)).toEqual({ ok: true, id: helper.id });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: helper.id } })).role).toBe("ADMIN");
    const audit = await prisma.auditLog.findFirst({ where: { actorId: owner.id, action: "user.role", targetId: helper.id } });
    expect(audit?.detail).toBe(`${helper.email} is now ADMIN`);
    expect(await prisma.notification.count({ where: { userId: helper.id, type: "ROLE_UPDATED" } })).toBe(1);

    // A second tap, or someone already on staff: refused plainly, nothing changes twice.
    expect(await addStaff({ id: owner.id, email: owner.email }, helper.id)).toMatchObject({ ok: false, error: expect.stringContaining("already staff") });
    expect(await findStaffCandidate(helper.email)).toMatchObject({ ok: false });
  });

  it("refuses an unknown email, a bad one, a banned account and one that never confirmed its email", async () => {
    expect(await findStaffCandidate("not an email")).toMatchObject({ ok: false, error: "Type their full email address." });
    expect(await findStaffCandidate(`${tag}-nobody@example.test`)).toMatchObject({ ok: false, error: expect.stringContaining("No account") });
    const banned = await account("banned", { bannedAt: new Date() });
    expect(await findStaffCandidate(banned.email)).toMatchObject({ ok: false, error: expect.stringContaining("banned") });
    const owner = await account("owner2", { role: "ADMIN" });
    expect(await addStaff({ id: owner.id, email: owner.email }, banned.id)).toMatchObject({ ok: false });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: banned.id } })).role).toBe("STUDENT");
    const unconfirmed = await account("unconfirmed", { emailVerified: null });
    expect(await findStaffCandidate(unconfirmed.email)).toMatchObject({ ok: false, error: expect.stringContaining("confirmed") });
  });
});
