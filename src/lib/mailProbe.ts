import { prisma } from "@/lib/prisma";

// The studio mail chain is Squarespace forwarding, a Gmail filter, Mailgun and
// the site, and any link can stop quietly. Once a day a test email is sent to
// music@; when the site receives it, that is recorded. If a test never arrives
// the watchdog tells the owner which links to check. The rows live in JobRun so
// no new table is needed.

export const PROBE_SENT_ROW = "mail-probe-sent";
export const PROBE_RECEIVED_ROW = "mail-probe-received";
/** A test email that has not arrived this long after it was sent counts as lost. */
export const PROBE_GRACE_MINUTES = 45;

/** Pure, so it is tested. Null means nothing to report. */
export function mailChainProblem(input: { sentAt: Date | null; received: boolean; now: Date }): string | null {
  const { sentAt, received, now } = input;
  if (!sentAt || received) return null;
  const minutes = Math.floor((now.getTime() - sentAt.getTime()) / 60_000);
  if (minutes <= PROBE_GRACE_MINUTES) return null;
  const hours = Math.floor(minutes / 60);
  const ago = hours >= 1 ? `${hours} hour${hours === 1 ? "" : "s"}` : `${minutes} minutes`;
  return `studio email: the test email sent to music@ ${ago} ago never reached the site. Customer emails to music@ may be getting lost. Check in order: Squarespace forwarding, the Gmail forwarding filter, then Mailgun > Logs`;
}

export function newProbeToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function recordProbeSent(token: string): Promise<void> {
  await prisma.jobRun.create({ data: { name: PROBE_SENT_ROW, ok: true, note: token } });
}

/** True only when this token was really sent by us, so a made-up subject cannot mark the chain healthy. */
export async function recordProbeReceived(token: string): Promise<boolean> {
  const sent = await prisma.jobRun.findFirst({ where: { name: PROBE_SENT_ROW, note: token }, select: { id: true } });
  if (!sent) return false;
  const already = await prisma.jobRun.findFirst({ where: { name: PROBE_RECEIVED_ROW, note: token }, select: { id: true } });
  if (!already) await prisma.jobRun.create({ data: { name: PROBE_RECEIVED_ROW, ok: true, note: token } });
  return true;
}

export async function findMailChainProblem(now = new Date()): Promise<string | null> {
  const last = await prisma.jobRun.findFirst({ where: { name: PROBE_SENT_ROW }, orderBy: { ranAt: "desc" }, select: { note: true, ranAt: true } });
  if (!last?.note) return null;
  const received = await prisma.jobRun.findFirst({ where: { name: PROBE_RECEIVED_ROW, note: last.note }, select: { id: true } });
  return mailChainProblem({ sentAt: last.ranAt, received: Boolean(received), now });
}
