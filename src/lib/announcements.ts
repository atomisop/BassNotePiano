import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/notifications";
import { sendPersonalEmail } from "@/lib/email";

export class AnnouncementError extends Error {}

const MAX_TITLE_LENGTH = 120;
const MAX_BODY_LENGTH = 1000;

// A short, fixed pause between sends, not Promise.all-style concurrency,
// this can reach the entire user base in one call, and Resend rate-limits
// requests (the default tier is ~2/sec); the same sequential-for-loop
// pacing this app's own scheduled payment-plan-installment emails already
// use (see netlify/functions/payment-plan-installments.ts), not a bulk
// send API this codebase has no other precedent for.
const EMAIL_SEND_DELAY_MS = 350;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Publishes an announcement and fans out a bell (Notification) entry to
 * every user. Email is opt-in per send (`sendEmail`), per the 2026-08-07
 * decision to stop burning Resend credits silently, a broadcast like this
 * should never trigger a mass send without being asked for explicitly each
 * time; the admin's own "Send email" toggle on the compose form is that
 * explicit ask. The banner/popup (getActiveAnnouncementForUser below) and
 * the bell entry always fire regardless, email is the one channel that's
 * conditional.
 */
export async function createAnnouncement(adminId: string, title: string, body: string, sendEmail: boolean) {
  const trimmedTitle = title.trim();
  const trimmedBody = body.trim();
  if (!trimmedTitle) throw new AnnouncementError("Title can't be empty.");
  if (!trimmedBody) throw new AnnouncementError("Message can't be empty.");
  if (trimmedTitle.length > MAX_TITLE_LENGTH) throw new AnnouncementError(`Title is too long (${MAX_TITLE_LENGTH} characters max).`);
  if (trimmedBody.length > MAX_BODY_LENGTH) throw new AnnouncementError(`Message is too long (${MAX_BODY_LENGTH} characters max).`);

  const announcement = await prisma.announcement.create({
    data: { title: trimmedTitle, body: trimmedBody, createdBy: adminId },
  });

  const users = await prisma.user.findMany({ select: { id: true, email: true, name: true } });
  await Promise.all(
    users.map((u) =>
      createNotification({ userId: u.id, type: "ANNOUNCEMENT", title: trimmedTitle, body: trimmedBody }).catch((err) =>
        console.error(`Failed to notify user ${u.id} of announcement ${announcement.id}:`, err),
      ),
    ),
  );

  // Sequential, not Promise.all: see EMAIL_SEND_DELAY_MS above. One user's
  // send failing (a bounced/invalid address, a transient Resend error)
  // doesn't stop the rest, same non-blocking, log-and-continue posture as
  // every other best-effort fan-out in this codebase (gamification
  // tracking, notification delivery above).
  if (sendEmail) {
    for (const u of users) {
      try {
        await sendPersonalEmail(u.email, trimmedTitle, trimmedBody, { firstName: u.name?.trim().split(/\s+/)[0] });
      } catch (err) {
        console.error(`Failed to email user ${u.id} of announcement ${announcement.id}:`, err);
      }
      await delay(EMAIL_SEND_DELAY_MS);
    }
  }

  return announcement;
}

export interface AdminAnnouncementRow {
  id: string;
  title: string;
  body: string;
  active: boolean;
  createdAt: Date;
  dismissedCount: number;
}

export async function listAnnouncements(): Promise<AdminAnnouncementRow[]> {
  const announcements = await prisma.announcement.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { dismissals: true } } },
  });

  return announcements.map((a) => ({
    id: a.id,
    title: a.title,
    body: a.body,
    active: a.active,
    createdAt: a.createdAt,
    dismissedCount: a._count.dismissals,
  }));
}

export async function setAnnouncementActive(id: string, active: boolean) {
  return prisma.announcement.update({ where: { id }, data: { active } });
}

export async function deleteAnnouncement(id: string) {
  return prisma.announcement.delete({ where: { id } });
}

export interface ActiveAnnouncement {
  id: string;
  title: string;
  body: string;
}

/**
 * The single most recent active announcement this user hasn't dismissed,
 * feeds the swipeable banner/popup. Only ever one at a time (not a queue):
 * if several are active, the newest wins and older ones are effectively
 * superseded rather than stacking popups.
 */
export async function getActiveAnnouncementForUser(userId: string): Promise<ActiveAnnouncement | null> {
  const announcement = await prisma.announcement.findFirst({
    where: { active: true, dismissals: { none: { userId } } },
    orderBy: { createdAt: "desc" },
  });
  if (!announcement) return null;
  return { id: announcement.id, title: announcement.title, body: announcement.body };
}

export async function dismissAnnouncement(userId: string, announcementId: string): Promise<void> {
  await prisma.announcementDismissal.upsert({
    where: { announcementId_userId: { announcementId, userId } },
    update: {},
    create: { announcementId, userId },
  });
}
