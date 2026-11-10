import { prisma } from "@/lib/prisma";
import { etDayKey, getFingerPracticeStatusOnce } from "@/lib/fingerPractice";
import { getFifthClassOffer } from "@/lib/paymentPlans";
import { findStoppedJobsOnce } from "@/lib/jobRun";

/**
 * The cards in the empty space at the bottom of the desktop sidebar. Each one is a small, true fact about the signed-in
 * person with one tap to act on it. They come back in priority order; the sidebar shows the first and lets the person step
 * through the rest. The Discord card and the low-credits card depend on live status the browser already has
 * (MeStatusProvider), so the sidebar adds those itself.
 */
export type SidebarCard =
  | { kind: "nextClass"; scheduledAt: string; durationMinutes: number }
  | { kind: "fifthClass"; scheduledAt: string; priceCents: number }
  | { kind: "scaleUnlocked"; scaleCode: string; slug: string }
  | { kind: "scaleWaiting"; scaleCode: string }
  | { kind: "streak"; streak: number; practicedToday: boolean; todaySeconds: number }
  | { kind: "continueLesson"; slug: string; scaleCode: string; lessonTitle: string; lessonNumber: number; done: number; total: number }
  | { kind: "friendsPracticing"; names: string[]; total: number }
  | { kind: "needsYou"; items: { label: string; count: number; href: string }[]; total: number }
  | { kind: "todayClasses"; count: number; next: string | null }
  | { kind: "jobsStopped"; count: number };

const CLASS_MINUTES = 45;
const DAY_MS = 86_400_000;

export async function getSidebarCards(userId: string, role: string, isOwner: boolean): Promise<SidebarCard[]> {
  return role === "ADMIN" ? getAdminCards(userId, isOwner) : getStudentCards(userId);
}

async function getStudentCards(userId: string): Promise<SidebarCard[]> {
  const now = new Date();
  const today = etDayKey(now);
  const [booking, fifth, progress, practice, friendIds] = await Promise.all([
    prisma.classBooking.findFirst({
      where: { studentId: userId, status: "SCHEDULED", scheduledAt: { gte: new Date(now.getTime() - CLASS_MINUTES * 60_000), lte: new Date(now.getTime() + 14 * DAY_MS) } },
      orderBy: { scheduledAt: "asc" },
      select: { scheduledAt: true },
    }),
    getFifthClassOffer(userId).catch(() => null),
    prisma.scaleProgress.findMany({
      where: { userId },
      select: { unlockedAt: true, completedAt: true, scaleGroup: { select: { id: true, slug: true, code: true, order: true } } },
      orderBy: { scaleGroup: { order: "asc" } },
    }),
    // Shared with Home and the top bar's status for this page load, instead of two more queries of its own.
    getFingerPracticeStatusOnce(userId),
    prisma.friendRequest.findMany({
      where: { status: "ACCEPTED", OR: [{ senderId: userId }, { receiverId: userId }] },
      select: { senderId: true, receiverId: true },
    }),
  ]);

  const cards: SidebarCard[] = [];
  if (booking) cards.push({ kind: "nextClass", scheduledAt: booking.scheduledAt.toISOString(), durationMinutes: CLASS_MINUTES });
  if (fifth) cards.push({ kind: "fifthClass", scheduledAt: fifth.scheduledAt.toISOString(), priceCents: fifth.priceCents });

  // Teacher approval: a scale opened in the last 3 days, or a finished scale waiting for the teacher's OK.
  const unlocked = progress.filter((p) => p.unlockedAt);
  const freshlyOpened = unlocked.filter((p) => p.unlockedAt && now.getTime() - p.unlockedAt.getTime() < 3 * DAY_MS && p.scaleGroup.order > 0).at(-1);
  if (freshlyOpened) cards.push({ kind: "scaleUnlocked", scaleCode: freshlyOpened.scaleGroup.code, slug: freshlyOpened.scaleGroup.slug });
  const current = unlocked.at(-1);
  if (current?.completedAt && !progress.some((p) => p.scaleGroup.order > current.scaleGroup.order && p.unlockedAt)) {
    cards.push({ kind: "scaleWaiting", scaleCode: current.scaleGroup.code });
  }

  // Streak and today's minutes. Only people who have started practicing get the card.
  if (practice.streak > 0 || practice.todaySeconds > 0 || (practice.longest ?? 0) > 0) {
    cards.push({ kind: "streak", streak: practice.streak, practicedToday: practice.completedToday, todaySeconds: practice.todaySeconds });
  }

  // Continue where you left off: the first lesson of the newest open, unfinished scale they have not completed.
  const open = unlocked.filter((p) => !p.completedAt).at(-1);
  if (open) {
    const lessons = await prisma.lesson.findMany({
      where: { scaleGroupId: open.scaleGroup.id },
      orderBy: { order: "asc" },
      select: { id: true, title: true, progress: { where: { userId, completedAt: { not: null } }, select: { id: true } } },
    });
    const next = lessons.findIndex((l) => l.progress.length === 0);
    if (lessons.length > 0 && next !== -1) {
      cards.push({
        kind: "continueLesson",
        slug: open.scaleGroup.slug,
        scaleCode: open.scaleGroup.code,
        lessonTitle: next >= 0 ? lessons[next].title : "",
        lessonNumber: next + 1,
        done: next,
        total: lessons.length,
      });
    }
  }

  // Friends who are practicing right now (a practice heartbeat in the last 2 minutes).
  const ids = [...new Set(friendIds.map((r) => (r.senderId === userId ? r.receiverId : r.senderId)))];
  if (ids.length > 0) {
    const live = await prisma.fingerPracticeDay.findMany({
      where: { userId: { in: ids }, day: today, lastBeatAt: { gte: new Date(now.getTime() - 2 * 60_000) } },
      select: { user: { select: { name: true, username: true } } },
      take: 6,
    });
    if (live.length > 0) {
      cards.push({
        kind: "friendsPracticing",
        names: live.map((r) => (r.user.name?.split(" ")[0] ?? r.user.username ?? "A friend")).slice(0, 3),
        total: live.length,
      });
    }
  }
  return cards;
}

async function getAdminCards(userId: string, isOwner: boolean): Promise<SidebarCard[]> {
  const now = new Date();
  const [payments, chats, unmarked, todays, stopped] = await Promise.all([
    prisma.zellePayment.count({ where: { status: "PENDING_REVIEW" } }),
    prisma.assistantEscalation.count({ where: { status: "OPEN" } }),
    prisma.classBooking.count({ where: { status: "SCHEDULED", scheduledAt: { lt: new Date(now.getTime() - 3 * 3_600_000) } } }),
    prisma.classBooking.findMany({
      where: { status: "SCHEDULED", scheduledAt: { gte: new Date(now.getTime() - CLASS_MINUTES * 60_000), lte: new Date(now.getTime() + DAY_MS) } },
      orderBy: { scheduledAt: "asc" },
      select: { scheduledAt: true },
    }),
    isOwner ? findStoppedJobsOnce().catch(() => []) : Promise.resolve([] as string[]),
  ]);

  const cards: SidebarCard[] = [];
  const items = [
    { label: payments === 1 ? "Payment to review" : "Payments to review", count: payments, href: "/admin/payments" },
    { label: chats === 1 ? "Open support chat" : "Open support chats", count: chats, href: "/admin/support" },
    { label: unmarked === 1 ? "Finished class to mark" : "Finished classes to mark", count: unmarked, href: "/admin/schedule?view=ATTENDANCE" },
  ].filter((i) => i.count > 0);
  if (stopped.length > 0) cards.push({ kind: "jobsStopped", count: stopped.length });
  if (items.length > 0) cards.push({ kind: "needsYou", items, total: items.reduce((n, i) => n + i.count, 0) });

  const todayKey = etDayKey(now);
  const sameDay = todays.filter((b) => etDayKey(b.scheduledAt) === todayKey);
  if (sameDay.length > 0) {
    const upcoming = sameDay.find((b) => b.scheduledAt.getTime() > now.getTime()) ?? null;
    // Several students can share one start time: count distinct class times, not seats.
    cards.push({ kind: "todayClasses", count: new Set(sameDay.map((b) => b.scheduledAt.getTime())).size, next: upcoming ? upcoming.scheduledAt.toISOString() : null });
  }
  void userId;
  return cards;
}
