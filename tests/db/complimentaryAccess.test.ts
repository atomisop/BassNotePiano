import { afterAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerAuthSession: async () => null, authOptions: {} }));
import { searchUsers } from "@/lib/admin";
import { approveZellePayment } from "@/lib/payments";
import { makeUser, newTag, prisma } from "./helpers";

const tag = newTag("cp");
const ids: string[] = [];

afterAll(async () => {
  await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
  await prisma.zellePayment.deleteMany({ where: { userId: { in: ids } } });
  await prisma.auditLog.deleteMany({ where: { targetId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
});

describe("complimentary access", () => {
  it("the Complimentary filter lists only non-admin accounts with the flag", async () => {
    const comped = await makeUser(`${tag}a`, "Comped Person", { hasCurriculumAccess: true });
    const plain = await makeUser(`${tag}b`, "Plain Person");
    const admin = await makeUser(`${tag}c`, "Admin Person", { hasCurriculumAccess: true, role: "ADMIN" });
    ids.push(comped.id, plain.id, admin.id);
    const found = (await searchUsers(tag, { complimentaryOnly: true })).map((u) => u.id);
    expect(found).toEqual([comped.id]);
    expect((await searchUsers(tag)).length).toBe(3);
  });

  it("an old curriculum payment that is approved switches the flag on and leaves a log entry", async () => {
    const u = await makeUser(`${tag}d`, "Old Buyer");
    ids.push(u.id);
    const p = await prisma.zellePayment.create({ data: { userId: u.id, purpose: "CURRICULUM", amountCents: 6999, zelleHandle: "pay@example.com", status: "PENDING_REVIEW" } });
    await approveZellePayment(p.id, null);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).hasCurriculumAccess).toBe(true);
    const log = await prisma.auditLog.findFirst({ where: { targetId: u.id, action: "access.grant" } });
    expect(log?.detail).toMatch(/old curriculum payment/);
  });
});
