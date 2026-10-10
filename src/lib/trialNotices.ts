import { prisma } from "@/lib/prisma";
import { claimNoticeMarker, noticeTrial } from "@/lib/studentNotices";

const DAY_MS = 86_400_000;

/**
 * Tells people their free trial ends within a day, and that it has ended. Run by the daily credit-expiry job. Each notice goes
 * once per person (a marker row), and nobody who already pays (an active plan or complimentary access) is told anything.
 */
export async function sendTrialNotices(now = new Date()): Promise<{ ending: number; ended: number }> {
  const candidates = await prisma.user.findMany({
    where: { trialEndsAt: { gt: new Date(now.getTime() - 2 * DAY_MS), lte: new Date(now.getTime() + DAY_MS) }, bannedAt: null, hasCurriculumAccess: false, paymentPlans: { none: { status: "ACTIVE" } } },
    select: { id: true, trialEndsAt: true },
  });
  let ending = 0;
  let ended = 0;
  for (const u of candidates) {
    const over = (u.trialEndsAt as Date).getTime() <= now.getTime();
    if (!(await claimNoticeMarker(`trial-notice:${over ? "ended" : "ending"}:${u.id}`))) continue;
    await noticeTrial({ userId: u.id, ended: over });
    if (over) ended++;
    else ending++;
  }
  return { ending, ended };
}
