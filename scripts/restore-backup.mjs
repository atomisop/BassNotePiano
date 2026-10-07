// Opens a nightly backup so you can read or restore from it.
//
//   BACKUP_ENCRYPTION_KEY=<the key> node scripts/restore-backup.mjs backups-2026-10-09.json.enc > backup.json
//
// Download the file from the storage bucket (backups/YYYY-MM-DD.json.enc) first.
// The output is one JSON document: { format, takenAt, tables: { ModelName: [rows] } }.
import { readFileSync } from "node:fs";
import { createDecipheriv } from "node:crypto";

const [file] = process.argv.slice(2);
if (!file) {
  console.error("Usage: node scripts/restore-backup.mjs <backup-file.json.enc>");
  process.exit(1);
}
const key = Buffer.from((process.env.BACKUP_ENCRYPTION_KEY ?? "").trim(), "base64");
if (key.length !== 32) {
  console.error("Set BACKUP_ENCRYPTION_KEY to the same key the nightly job uses.");
  process.exit(1);
}
const data = readFileSync(file);
const magic = "BNPB1";
if (data.subarray(0, magic.length).toString() !== magic) {
  console.error("That is not a backup file.");
  process.exit(1);
}
const iv = data.subarray(magic.length, magic.length + 12);
const tag = data.subarray(magic.length + 12, magic.length + 28);
const body = data.subarray(magic.length + 28);
const decipher = createDecipheriv("aes-256-gcm", key, iv);
decipher.setAuthTag(tag);
try {
  process.stdout.write(Buffer.concat([decipher.update(body), decipher.final()]));
} catch {
  console.error("Could not decrypt: wrong key, or the file was damaged.");
  process.exit(1);
}
