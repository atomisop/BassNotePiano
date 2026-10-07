import { randomBytes } from "crypto";
import { describe, expect, it } from "vitest";
import {
  BACKUP_KEEP_DAYS,
  backupKeyForDate,
  backupsToDelete,
  decryptBackup,
  encryptBackup,
  parseBackupKey,
  serializeTables,
  summarizeTables,
} from "@/lib/backupCore";

const key = randomBytes(32);

describe("backup encryption", () => {
  it("round-trips", () => {
    const plain = Buffer.from("secret rows");
    expect(decryptBackup(encryptBackup(plain, key), key).toString()).toBe("secret rows");
  });
  it("never contains the plain text", () => {
    expect(encryptBackup(Buffer.from("hello@example.com"), key).includes("hello@example.com")).toBe(false);
  });
  it("fails with the wrong key and when any byte is changed", () => {
    const file = encryptBackup(Buffer.from("secret rows"), key);
    expect(() => decryptBackup(file, randomBytes(32))).toThrow();
    const damaged = Buffer.from(file);
    damaged[damaged.length - 1] ^= 1;
    expect(() => decryptBackup(damaged, key)).toThrow();
    expect(() => decryptBackup(Buffer.from("not a backup at all, just text"), key)).toThrow(/Not a backup/);
  });
  it("uses a new iv each time", () => {
    const a = encryptBackup(Buffer.from("x"), key);
    const b = encryptBackup(Buffer.from("x"), key);
    expect(a.equals(b)).toBe(false);
  });
});

describe("parseBackupKey", () => {
  it("accepts 32 bytes of base64 and refuses anything weaker", () => {
    expect(parseBackupKey(key.toString("base64"))).toEqual(key);
    expect(() => parseBackupKey(undefined)).toThrow(/not set/);
    expect(() => parseBackupKey("c2hvcnQ=")).toThrow(/32 random bytes/);
  });
});

describe("serializeTables", () => {
  it("keeps dates and big numbers, and reports what it holds", () => {
    const tables = { User: [{ id: "a", createdAt: new Date("2026-10-09T00:00:00Z"), big: BigInt(5) }], Payment: [] };
    const doc = JSON.parse(serializeTables(tables).toString());
    expect(doc.format).toBe("bnp-backup-1");
    expect(doc.tables.User[0].createdAt).toBe("2026-10-09T00:00:00.000Z");
    expect(doc.tables.User[0].big).toBe("5");
    expect(summarizeTables(tables)).toEqual({ tableCount: 2, rowCount: 1 });
  });
});

describe("retention", () => {
  const today = new Date("2026-10-09T06:30:00Z");
  it("names files by day", () => {
    expect(backupKeyForDate(today)).toBe("backups/2026-10-09.json.enc");
  });
  it("deletes only backups older than the keep window, and leaves other files alone", () => {
    const old = backupKeyForDate(new Date(today.getTime() - (BACKUP_KEEP_DAYS + 1) * 86_400_000));
    const edge = backupKeyForDate(new Date(today.getTime() - BACKUP_KEEP_DAYS * 86_400_000));
    const fresh = backupKeyForDate(new Date(today.getTime() - 3 * 86_400_000));
    expect(backupsToDelete([old, edge, fresh, "backups/notes.txt", "lessons/x.mp4"], today)).toEqual([old]);
  });
});
