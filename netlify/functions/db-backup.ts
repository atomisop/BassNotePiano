import { schedule } from "@netlify/functions";
import { prisma } from "../../src/lib/prisma";
import { runJob } from "../../src/lib/jobRun";
import { deleteBackupObject, headBackupObject, isObjectStorageConfigured, listBackupObjects, putBackupObject } from "../../src/lib/storage";
import { exportAllTables } from "../../src/lib/backupExport";
import {
  backupKeyForDate,
  backupsToDelete,
  decryptBackup,
  encryptBackup,
  parseBackupKey,
  serializeTables,
  sha256,
  summarizeTables,
} from "../../src/lib/backupCore";

// Every night: copy every table to an encrypted file in storage, check the copy
// can be read back with the key, keep the last 35 days. If anything fails, or
// the job stops running, the job watchdog emails the owner (this is registered
// in JOB_MAX_SILENCE_HOURS), so a backup problem is never silent.
export const runDbBackup = () =>
  runJob("db-backup", async () => {
    if (!isObjectStorageConfigured()) throw new Error("Backups need the R2 storage settings (R2_*).");
    const key = parseBackupKey(process.env.BACKUP_ENCRYPTION_KEY);

    const tables = await exportAllTables(prisma);

    const plain = serializeTables(tables);
    const encrypted = encryptBackup(plain, key);
    // Prove the key opens it before relying on it.
    if (sha256(decryptBackup(encrypted, key)) !== sha256(plain)) throw new Error("The backup did not decrypt back to the same data.");

    const now = new Date();
    const objectKey = backupKeyForDate(now);
    await putBackupObject(objectKey, encrypted);
    const stored = await headBackupObject(objectKey);
    if (stored !== encrypted.length) throw new Error(`The stored backup is ${stored ?? "missing"} bytes, expected ${encrypted.length}.`);

    for (const old of backupsToDelete(await listBackupObjects(), now)) await deleteBackupObject(old);

    const { tableCount, rowCount } = summarizeTables(tables);
    console.log(`Backup ${objectKey}: ${tableCount} tables, ${rowCount} rows, ${encrypted.length} bytes`);
    return { statusCode: 200 };
  });

export const handler = schedule("30 6 * * *", async () => runDbBackup());
