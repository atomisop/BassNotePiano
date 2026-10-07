import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

// Nightly backup, pure parts. The backup is encrypted before it is uploaded:
// the storage bucket the app uses is public, so a plain copy of the database
// there would be readable by anyone with the link. No database code here, so
// all of it is tested.

const MAGIC = Buffer.from("BNPB1"); // marks the file format and version
const IV_BYTES = 12;
const TAG_BYTES = 16;

/** BACKUP_ENCRYPTION_KEY: 32 random bytes, base64. Anything else is refused, not silently weakened. */
export function parseBackupKey(raw: string | undefined): Buffer {
  if (!raw) throw new Error("BACKUP_ENCRYPTION_KEY is not set.");
  const key = Buffer.from(raw.trim(), "base64");
  if (key.length !== 32) throw new Error("BACKUP_ENCRYPTION_KEY must be 32 random bytes encoded as base64.");
  return key;
}

/** File layout: magic, iv, auth tag, ciphertext (AES-256-GCM). A changed byte anywhere makes decryption fail. */
export function encryptBackup(plain: Buffer, key: Buffer): Buffer {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), body]);
}

export function decryptBackup(file: Buffer, key: Buffer): Buffer {
  if (file.length < MAGIC.length + IV_BYTES + TAG_BYTES || !file.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error("Not a backup file.");
  }
  const iv = file.subarray(MAGIC.length, MAGIC.length + IV_BYTES);
  const tag = file.subarray(MAGIC.length + IV_BYTES, MAGIC.length + IV_BYTES + TAG_BYTES);
  const body = file.subarray(MAGIC.length + IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]);
}

/** JSON that keeps dates and big numbers readable: dates as ISO text, BigInt as text. */
export function serializeTables(tables: Record<string, unknown[]>): Buffer {
  const document = { format: "bnp-backup-1", takenAt: new Date().toISOString(), tables };
  return Buffer.from(JSON.stringify(document, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
}

export function summarizeTables(tables: Record<string, unknown[]>): { tableCount: number; rowCount: number } {
  const names = Object.keys(tables);
  return { tableCount: names.length, rowCount: names.reduce((sum, n) => sum + tables[n].length, 0) };
}

/** Tables with nothing worth restoring: one-time codes, rate-limit bookkeeping, page counters, job logs. */
export const BACKUP_SKIPPED_MODELS = new Set(["VerificationCode", "PageHit", "JobRun", "RateLimitEvent"]);

export function backupKeyForDate(date: Date): string {
  return `backups/${date.toISOString().slice(0, 10)}.json.enc`;
}

export const BACKUP_KEEP_DAYS = 35;

/** Which stored backups to delete: those dated more than BACKUP_KEEP_DAYS before today. Unknown names are never touched. */
export function backupsToDelete(keys: string[], today: Date): string[] {
  const cutoff = new Date(today.getTime() - BACKUP_KEEP_DAYS * 86_400_000).toISOString().slice(0, 10);
  return keys.filter((k) => {
    const m = /^backups\/(\d{4}-\d{2}-\d{2})\.json\.enc$/.exec(k);
    return m !== null && m[1] < cutoff;
  });
}

export function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}
