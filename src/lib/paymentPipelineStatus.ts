import { prisma } from "@/lib/prisma";

// Is the bank and Venmo email pipeline alive, and what is stuck in it?
// Only reads, and imports nothing but prisma, so the scheduled functions can
// use it too (they run outside Next).

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Silence this long, with payments waiting, means the Gmail script has probably stopped. */
export const QUIET_AFTER_HOURS = 48;
/** A payment someone says they sent has to be this old before its missing email counts as a sign. */
export const WAITING_AFTER_HOURS = 24;
/** An email that matched no payment is shown (and counted) for this long. */
export const UNMATCHED_WINDOW_DAYS = 14;
/** Give automatic matching this long before an email counts as unmatched. */
export const UNMATCHED_GRACE_HOURS = 1;

export type PipelineStatus = "ok" | "quiet";

/** Pure, so it is tested: quiet only when payments are waiting AND no bank email has arrived for two days. */
export function pipelineStatus(input: { lastEmailAt: Date | null; waitingPayments: number; now?: Date }): {
  status: PipelineStatus;
  hoursSinceEmail: number | null;
} {
  const now = input.now ?? new Date();
  const hoursSinceEmail = input.lastEmailAt ? Math.floor((now.getTime() - input.lastEmailAt.getTime()) / HOUR_MS) : null;
  const silent = hoursSinceEmail === null || hoursSinceEmail >= QUIET_AFTER_HOURS;
  return { status: input.waitingPayments > 0 && silent ? "quiet" : "ok", hoursSinceEmail };
}

/** "3 hours ago", "2 days ago", "never". */
export function describeAge(hours: number | null): string {
  if (hours === null) return "never";
  if (hours < 1) return "less than an hour ago";
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  return `${Math.floor(hours / 24)} days ago`;
}

export interface PaymentPipelineHealth {
  status: PipelineStatus;
  lastEmailAt: Date | null;
  hoursSinceEmail: number | null;
  waitingPayments: number;
}

export async function getPaymentPipelineHealth(now = new Date()): Promise<PaymentPipelineHealth> {
  const [last, waitingPayments] = await Promise.all([
    prisma.processedPaymentEmail.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    // Someone says they paid, and a day later the system has still not seen the money.
    prisma.zellePayment.count({
      where: { status: "PENDING_REVIEW", createdAt: { lt: new Date(now.getTime() - WAITING_AFTER_HOURS * HOUR_MS) } },
    }),
  ]);
  const lastEmailAt = last?.createdAt ?? null;
  return { ...pipelineStatus({ lastEmailAt, waitingPayments, now }), lastEmailAt, waitingPayments };
}

/** Payment emails that matched no payment and have not been dismissed. */
export function unmatchedReceiptWhere(now = new Date()) {
  return {
    paymentId: null,
    dismissedAt: null,
    createdAt: {
      lt: new Date(now.getTime() - UNMATCHED_GRACE_HOURS * HOUR_MS),
      gt: new Date(now.getTime() - UNMATCHED_WINDOW_DAYS * DAY_MS),
    },
  };
}

export async function countUnmatchedReceipts(now = new Date()): Promise<number> {
  return prisma.processedPaymentEmail.count({ where: unmatchedReceiptWhere(now) });
}

/**
 * One line for the job watchdog when payment emails have stopped arriving. The text is
 * constant on purpose: the watchdog treats a changed line as a new problem and emails again.
 */
export function pipelineProblem(health: Pick<PaymentPipelineHealth, "status">): string | null {
  return health.status === "quiet"
    ? `payment emails: payments are waiting and no bank or Venmo email has arrived for over ${QUIET_AFTER_HOURS} hours (check the Gmail forwarding script)`
    : null;
}

export async function findPaymentPipelineProblem(now = new Date()): Promise<string | null> {
  return pipelineProblem(await getPaymentPipelineHealth(now));
}
