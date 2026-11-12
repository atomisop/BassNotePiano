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
    const marker = `trial-notice:${over ? "ended" : "ending"}:${u.id}`;
    if (!(await claimNoticeMarker(marker))) continue;
    try {
      await noticeTrial({ userId: u.id, ended: over });
    } catch (err) {
      // Give the one-time marker back so the next run tries this person again, and keep going for everyone else.
      await prisma.appSetting.deleteMany({ where: { key: marker } }).catch(() => undefined);
      console.error(`Trial notice failed for ${u.id} (continuing):`, err);
      continue;
    }
    if (over) ended++;
    else ending++;
  }
  return { ending, ended };
}
