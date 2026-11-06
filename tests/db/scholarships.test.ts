import { afterAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerAuthSession: async () => null, authOptions: {} }));
import { claimScholarshipCode, createScholarshipCode, regenerateScholarshipCode, revokeScholarshipCode, ScholarshipError, updateScholarshipCode } from "@/lib/scholarships";
import { makeUser, newTag, prisma } from "./helpers";

const tag = newTag("sch");
const ids: string[] = [];
const balance = async (id: string) => (await prisma.user.findUniqueOrThrow({ where: { id } })).classCredits;

afterAll(async () => {
  await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
  await prisma.scholarshipCode.deleteMany({ where: { OR: [{ claimedById: { in: ids } }, { createdById: { in: ids } }] } });
  await prisma.creditGrant.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
});

describe("scholarship codes", () => {
  it("claims once, for the right email only, and adds the credits", async () => {
    const admin = await makeUser(`${tag}a`, "Owner", { role: "ADMIN" });
    const stu = await makeUser(`${tag}s`, "Student One", { emailVerified: new Date() });
    const other = await makeUser(`${tag}o`, "Other Person", { emailVerified: new Date() });
    ids.push(admin.id, stu.id, other.id);
    const row = await createScholarshipCode({ email: stu.email.toUpperCase(), classes: 4, actor: { id: admin.id, email: admin.email } });
    expect(row.code).toMatch(/^\d{16}$/);

    await expect(claimScholarshipCode(other.id, row.code)).rejects.toThrow(/isn't valid for this account/);
    expect(await balance(other.id)).toBe(0);

    const before = await balance(stu.id);
    const res = await claimScholarshipCode(stu.id, row.code.replace(/(\d{4})/g, "$1 "));
    expect(res.credits).toBe(8);
    expect(await balance(stu.id)).toBe(before + 8);
    expect(await prisma.creditGrant.count({ where: { userId: stu.id, source: "SCHOLARSHIP" } })).toBe(1);

    await expect(claimScholarshipCode(stu.id, row.code)).rejects.toThrow(/already been claimed/);
    expect(await balance(stu.id)).toBe(before + 8);
  });

  it("two claims at the same moment credit only once", async () => {
    const admin = await makeUser(`${tag}a2`, "Owner Two", { role: "ADMIN" });
    const stu = await makeUser(`${tag}s2`, "Student Two", { emailVerified: new Date() });
    ids.push(admin.id, stu.id);
    const row = await createScholarshipCode({ email: stu.email, classes: 2, actor: { id: admin.id, email: admin.email } });
    const results = await Promise.allSettled([claimScholarshipCode(stu.id, row.code), claimScholarshipCode(stu.id, row.code)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await balance(stu.id)).toBe(4);
  });

  it("refuses revoked, lapsed and unverified-email claims, and bad input", async () => {
    const admin = await makeUser(`${tag}a3`, "Owner Three", { role: "ADMIN" });
    const stu = await makeUser(`${tag}s3`, "Student Three", { emailVerified: new Date() });
    const unv = await makeUser(`${tag}s4`, "Student Four", { emailVerified: null });
    ids.push(admin.id, stu.id, unv.id);
    const actor = { id: admin.id, email: admin.email };
    const revoked = await createScholarshipCode({ email: stu.email, classes: 1, actor });
    await revokeScholarshipCode(revoked.id, actor);
    await expect(claimScholarshipCode(stu.id, revoked.code)).rejects.toBeInstanceOf(ScholarshipError);

    const lapsed = await createScholarshipCode({ email: stu.email, classes: 1, actor });
    await prisma.scholarshipCode.update({ where: { id: lapsed.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await expect(claimScholarshipCode(stu.id, lapsed.code)).rejects.toBeInstanceOf(ScholarshipError);

    const forUnverified = await createScholarshipCode({ email: unv.email, classes: 1, actor });
    await expect(claimScholarshipCode(unv.id, forUnverified.code)).rejects.toThrow(/Verify your email/);

    await expect(claimScholarshipCode(stu.id, "123")).rejects.toThrow(/16 digits/);
    await expect(claimScholarshipCode(stu.id, "0000000000000000")).rejects.toThrow(/isn't valid/);
    await expect(createScholarshipCode({ email: "nope", classes: 1, actor })).rejects.toBeInstanceOf(ScholarshipError);
    await expect(createScholarshipCode({ email: stu.email, classes: 0, actor })).rejects.toBeInstanceOf(ScholarshipError);
    expect(await balance(stu.id)).toBe(0);
  });

  it("needs an existing student account, takes a custom code, and lets the owner edit or re-digit only unclaimed codes", async () => {
    const admin = await makeUser(`${tag}a5`, "Owner Five", { role: "ADMIN" });
    const stu = await makeUser(`${tag}s5`, "Student Five", { emailVerified: new Date() });
    ids.push(admin.id, stu.id);
    const actor = { id: admin.id, email: admin.email };
    await expect(createScholarshipCode({ email: `nobody-${tag}@example.com`, classes: 2, actor })).rejects.toThrow(/No student account/);
    await expect(createScholarshipCode({ email: admin.email, classes: 2, actor })).rejects.toThrow(/No student account/);
    await expect(createScholarshipCode({ email: stu.email, classes: 2, code: "12ab", actor })).rejects.toThrow(/16 digits/);

    const custom = `${String(Date.now()).padStart(13, "0")}555`.slice(-16);
    const row = await createScholarshipCode({ email: stu.email, classes: 2, code: custom, actor });
    expect(row.code).toBe(custom);
    await expect(createScholarshipCode({ email: stu.email, classes: 2, code: custom, actor })).rejects.toThrow(/already exists/);

    await updateScholarshipCode(row.id, { classes: 6, note: "bigger" }, actor);
    expect((await prisma.scholarshipCode.findUniqueOrThrow({ where: { id: row.id } })).credits).toBe(12);
    const fresh = await regenerateScholarshipCode(row.id, actor);
    expect(fresh).not.toBe(custom);
    await expect(claimScholarshipCode(stu.id, custom)).rejects.toThrow(/isn't valid/);
    await claimScholarshipCode(stu.id, fresh);
    expect(await balance(stu.id)).toBe(12);
    await expect(updateScholarshipCode(row.id, { classes: 1 }, actor)).rejects.toThrow(/unclaimed/);
    await expect(regenerateScholarshipCode(row.id, actor)).rejects.toThrow(/unclaimed/);
  });
});
