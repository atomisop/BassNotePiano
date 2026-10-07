import { prisma } from "@/lib/prisma";
import { OWNER_EMAIL } from "@/lib/adminNotifications";
import { sendNotificationEmailWithCta, getAppUrl } from "@/lib/email";
import { reportError } from "@/lib/reportError";
import {
  ATOM_BUSY_WINDOW_MINUTES,
  ATOM_RECOVERED,
  GEMINI_BILLING_URL,
  atomAlertNote,
  describeAtomAlert,
  shouldAlertAtom,
  shouldAnnounceAtomRecovery,
  type GeminiError,
} from "@/lib/atomFailure";

// Atom's own alarm. When Gemini refuses a request (credits used up, key
// rejected, Google down) a visitor gets a plain "can't answer" message with a
// person offered, and the owner is told here, once, instead of finding out from
// a customer. State lives in JobRun rows: "atom-failure" (one per failure) and
// "atom-alert" (the last email sent, or "recovered").

const FAILURE_ROW = "atom-failure";
const ALERT_ROW = "atom-alert";
const MIN_MS = 60_000;
const DAY_MS = 24 * 3_600_000;

const lastAlert = () => prisma.jobRun.findFirst({ where: { name: ALERT_ROW }, orderBy: { ranAt: "desc" }, select: { note: true, ranAt: true } });

/** Never throws: a failure to alert must not turn into a second failure for the visitor. */
export async function recordAtomFailure(err: GeminiError, now = new Date()): Promise<void> {
  try {
    const kind = err.kind;
    await prisma.jobRun.create({ data: { name: FAILURE_ROW, ok: false, note: `${kind} ${err.status}`, ranAt: now } });
    const last = await lastAlert();
    // Only temporary failures count toward "keeps failing", and only those since the last recovery:
    // credit and key failures have their own alert, and an old problem must not make a new blip look worse.
    let since = new Date(now.getTime() - ATOM_BUSY_WINDOW_MINUTES * MIN_MS);
    if (last?.note === ATOM_RECOVERED && last.ranAt > since) since = last.ranAt;
    const recentFailures = await prisma.jobRun.count({
      where: { name: FAILURE_ROW, ranAt: { gt: since }, OR: [{ note: { startsWith: "busy" } }, { note: { startsWith: "other" } }] },
    });
    // A sweep of old failure rows, roughly once in a hundred.
    if (Math.random() < 0.01) {
      await prisma.jobRun.deleteMany({ where: { name: FAILURE_ROW, ranAt: { lt: new Date(now.getTime() - 2 * DAY_MS) } } }).catch(() => undefined);
    }
    if (!shouldAlertAtom({ kind, recentFailures, last, now })) return;

    const note = atomAlertNote(kind);
    const alert = describeAtomAlert(note);
    await sendNotificationEmailWithCta(OWNER_EMAIL, alert.subject, alert.body, {
      label: alert.ctaLabel,
      url: alert.external ? GEMINI_BILLING_URL : getAppUrl("/admin"),
    });
    // Recorded only after the email went, so a failed send is tried again on the next failure.
    await prisma.jobRun.create({ data: { name: ALERT_ROW, ok: true, note, ranAt: now } });
  } catch (e) {
    reportError(e, "Atom failure alert");
  }
}

/** Called after a successful answer. Sends one "working again" email if an alert was open. Never throws. */
export async function noteAtomSuccess(now = new Date()): Promise<void> {
  try {
    const last = await lastAlert();
    if (!shouldAnnounceAtomRecovery(last)) return;
    await sendNotificationEmailWithCta(OWNER_EMAIL, "Atom is answering again", "Atom is answering visitors again.", {
      label: "Open admin",
      url: getAppUrl("/admin"),
    });
    await prisma.jobRun.create({ data: { name: ALERT_ROW, ok: true, note: ATOM_RECOVERED, ranAt: now } });
  } catch (e) {
    reportError(e, "Atom recovery notice");
  }
}

/** For the Overview: is an Atom alert open, and of what kind. */
export async function getAtomAlertState(): Promise<{ note: "credits" | "key" | "busy" } | null> {
  const last = await lastAlert();
  if (!last || last.note === ATOM_RECOVERED || (last.note !== "credits" && last.note !== "key" && last.note !== "busy")) return null;
  return { note: last.note };
}
