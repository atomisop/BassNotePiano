// The owner's Refresh on Admin > Setup > Security (AutomaticTasks): a live check that each automatic task COULD work right now, without
// running any of them. Each task lists what it depends on (the database tables it reads, the email service, Discord, backup storage, the
// mail chain, the outside monitor); every one of those is tested once, read only, and each task's row shows the result. Nothing is sent,
// written or recorded, so a task's last run stays its last real run.

import { prisma } from "@/lib/prisma";
import { DISCORD_GUILD_ID } from "@/lib/discord";
import { findMailChainProblem } from "@/lib/mailProbe";
import { isObjectStorageConfigured, listBackupObjects } from "@/lib/storage";
import { parseBackupKey } from "@/lib/backupCore";
import type { Probe, ProbeResult } from "@/lib/jobCheckRules";

const TIMEOUT_MS = 8000;
const DAY = 86_400_000;

function withTimeout<T>(work: Promise<T>, what: string): Promise<T> {
  return Promise.race([work, new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${what} did not answer within ${TIMEOUT_MS / 1000} seconds.`)), TIMEOUT_MS))]);
}

/** Every table the automatic tasks read. */
const DB_TABLES = ["User", "PaymentPlan", "ZellePayment", "CreditGrant", "ClassBooking", "ClassSchedule", "SlotWaitlist", "JobRun"];

async function checkDatabase(): Promise<void> {
  // Reads one row from every table the tasks use, so a missing table or a dead connection shows up, not only "the database is on".
  for (const table of DB_TABLES) await prisma.$queryRawUnsafe(`SELECT 1 FROM "${table}" LIMIT 1`);
}

async function checkEmail(): Promise<string> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    if (process.env.NODE_ENV !== "production") return "No email key on this computer, so emails are skipped here.";
    throw new Error("The email key (RESEND_API_KEY) is missing, so no email can go out.");
  }
  // Asks Resend about the account (read only). A send-only key is refused here with "restricted", which still proves the key is real.
  const res = await fetch("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${key}` }, cache: "no-store" });
  if (res.ok) return "The email service accepted the key.";
  const body = await res.text().catch(() => "");
  if (res.status === 401 && /restricted/i.test(body)) return "The email service accepted the key.";
  throw new Error(`The email service refused the key (${res.status}).`);
}

async function checkDiscord(): Promise<string> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) throw new Error("No Discord bot token (DISCORD_BOT_TOKEN), so class channels cannot be made.");
  const res = await fetch(`https://discord.com/api/v10/guilds/${DISCORD_GUILD_ID}`, { headers: { Authorization: `Bot ${token}` }, cache: "no-store" });
  if (res.ok) return "The bot is signed in and can see the server.";
  if (res.status === 401) throw new Error("Discord refused the bot token.");
  throw new Error(`The bot cannot reach the Discord server (${res.status}). It may have been removed from it.`);
}

async function checkStorage(now: Date): Promise<string> {
  if (!isObjectStorageConfigured()) throw new Error("The storage settings (R2_*) are missing, so backups cannot be saved.");
  parseBackupKey(process.env.BACKUP_ENCRYPTION_KEY);
  const keys = await listBackupObjects();
  const newest = keys.sort().at(-1);
  if (!newest) throw new Error("Storage answered, but there is no backup in it yet.");
  const day = newest.match(/(\d{4}-\d{2}-\d{2})/)?.[1];
  const age = day ? now.getTime() - new Date(`${day}T23:59:59Z`).getTime() : Infinity;
  if (age > 2 * DAY) throw new Error(`Storage answered, but the newest backup is from ${day ?? "an unknown day"}.`);
  return `Storage and the backup key work. Newest backup: ${day}.`;
}

async function checkMailChain(now: Date): Promise<string> {
  const problem = await findMailChainProblem(now);
  if (problem) throw new Error(problem);
  return "The last test email made it all the way to the inbox.";
}

async function checkMonitor(): Promise<string> {
  if (!process.env.HEALTHCHECK_PING_URL) throw new Error("No outside monitor (HEALTHCHECK_PING_URL), so nobody outside notices if the scheduler stops.");
  return "The outside monitor is set up.";
}

const message = (err: unknown) => (err instanceof Error ? err.message : "It failed without saying why.").slice(0, 300);

/** Tests everything the tasks depend on, once each and at the same time. Read only. */
export async function runProbes(now = new Date()): Promise<Record<Probe, ProbeResult>> {
  const probes: Record<Probe, () => Promise<string | void>> = {
    database: checkDatabase,
    email: checkEmail,
    discord: checkDiscord,
    storage: () => checkStorage(now),
    mailChain: () => checkMailChain(now),
    monitor: checkMonitor,
  };
  const entries = await Promise.all(
    (Object.keys(probes) as Probe[]).map(async (probe): Promise<[Probe, ProbeResult]> => {
      try {
        const detail = await withTimeout(Promise.resolve(probes[probe]()), probe);
        return [probe, { ok: true, detail: detail || null }];
      } catch (err) {
        return [probe, { ok: false, detail: message(err) }];
      }
    }),
  );
  return Object.fromEntries(entries) as Record<Probe, ProbeResult>;
}

