// What each automatic task depends on, and how its live check reads (pure, tested in tests/jobCheckNow.test.ts). The checks themselves
// are in jobCheckNow.ts; none of them runs a task.

export type Probe = "database" | "email" | "discord" | "storage" | "mailChain" | "monitor";

export interface ProbeResult {
  ok: boolean;
  detail: string | null;
}

export const PROBE_LABEL: Record<Probe, string> = {
  database: "Database",
  email: "Email",
  discord: "Discord",
  storage: "Backup storage",
  mailChain: "Mail chain",
  monitor: "Outside monitor",
};

/** Every watched task, with what it needs to do its work. */
export const JOB_NEEDS: Record<string, Probe[]> = {
  "credit-expiry": ["database", "email"],
  "payment-plan-installments": ["database", "email"],
  "payment-plan-reservations": ["database", "email"],
  "practice-reminders": ["database", "email"],
  "admin-daily-summary": ["database", "email"],
  "class-reminders": ["database", "email"],
  "attendance-auto-charge": ["database", "email"],
  "auto-approvals": ["database", "email"],
  "discord-class-channels": ["database", "discord"],
  "mail-chain-probe": ["email", "mailChain"],
  "db-backup": ["database", "storage"],
  "slot-waitlist": ["database", "email"],
  "job-watchdog": ["database", "email", "monitor"],
  "job-catch-up": ["database"],
};

export interface JobVerdict {
  ok: boolean;
  /** One line: what was checked, or what is broken. */
  summary: string;
  /** The failures, one per broken dependency. */
  problems: string[];
}

export function jobVerdict(name: string, results: Partial<Record<Probe, ProbeResult>>): JobVerdict {
  const needs = JOB_NEEDS[name] ?? [];
  const problems = needs
    .map((probe) => ({ probe, result: results[probe] }))
    .filter(({ result }) => !result || !result.ok)
    .map(({ probe, result }) => `${PROBE_LABEL[probe]}: ${result?.detail ?? "not checked."}`);
  if (problems.length > 0) return { ok: false, summary: problems[0], problems };
  return { ok: true, summary: `${needs.map((p) => PROBE_LABEL[p]).join(", ")} working`, problems: [] };
}
