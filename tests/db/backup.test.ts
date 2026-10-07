import { randomBytes } from "crypto";
import { afterAll, describe, expect, it } from "vitest";
import { exportAllTables } from "@/lib/backupExport";
import { decryptBackup, encryptBackup, serializeTables } from "@/lib/backupCore";
import { makeUser, newTag, prisma } from "./helpers";

const tag = newTag("bu");
const users: string[] = [];
afterAll(async () => {
  await prisma.jobRun.deleteMany({ where: { name: tag } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
});

describe("nightly backup export", () => {
  it("includes real rows, skips the throwaway tables, and survives encryption", async () => {
    const u = await makeUser(tag, "Backup Bea");
    users.push(u.id);
    await prisma.jobRun.create({ data: { name: tag, ok: true } });
    const tables = await exportAllTables(prisma);
    expect((tables.User as { id: string }[]).some((r) => r.id === u.id)).toBe(true);
    expect(tables.JobRun).toBeUndefined();
    expect(tables.VerificationCode).toBeUndefined();
    const key = randomBytes(32);
    const restored = JSON.parse(decryptBackup(encryptBackup(serializeTables(tables), key), key).toString());
    expect(restored.tables.User.some((r: { id: string; email: string }) => r.id === u.id && r.email === u.email)).toBe(true);
  });
  it("pages through a table in small steps without losing or repeating rows", async () => {
    const a = await makeUser(tag, "Page A");
    const b = await makeUser(tag, "Page B");
    users.push(a.id, b.id);
    const whole = (await exportAllTables(prisma))["User"] as { id: string }[];
    const paged = (await exportAllTables(prisma, 1))["User"] as { id: string }[];
    expect(paged.map((r) => r.id)).toEqual(whole.map((r) => r.id));
    expect(new Set(paged.map((r) => r.id)).size).toBe(paged.length);
  });
});
