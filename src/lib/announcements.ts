import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/notifications";

export class AnnouncementError extends Error {}

const MAX_TITLE_LENGTH = 120;
const MAX_BODY_LENGTH = 1000;

/**
 * Publishes an announcement and fans out a bell (Notification) entry to
 * every user. Deliberately no email — this can reach the entire user base
 * at once, and per the 2026-08-07 decision to stop burning Resend credits
 * silently, a broadcast like this should never trigger a mass send without
 * being asked for explicitly. The banner/popup (getActiveAnnouncementForUser
 * below) and the bell entry are the only two delivery channels.
 */
export async function createAnnouncement(adminId: string, title: string, body: string) {
  const trimmedTitle = title.trim();
  const trimmedBody = body.trim();
  if (!trimmedTitle) throw new AnnouncementError("Title can't be empty.");
  if (!trimmedBody) throw new AnnouncementError("Message can't be empty.");
  if (trimmedTitle.length > MAX_TITLE_LENGTH) throw new AnnouncementError(`Title is too long (${MAX_TITLE_LENGTH} characters max).`);
  if (trimmedBody.length > MAX_BODY_LENGTH) throw new AnnouncementError(`Message is too long (${MAX_BODY_LENGTH} characters max).`);

  const announcement = await prisma.announcement.create({
    data: { title: trimmedTitle, body: trimmedBody, createdBy: adminId },
  });

  const users = await prisma.user.findMany({ select: { id: true } });
  await Promise.all(
    users.map((u) =>
      createNotification({ userId: u.id, type: "ANNOUNCEMENT", title: trimmedTitle, body: trimmedBody }).catch((err) =>
        console.error(`Failed to notify user ${u.id} of announcement ${announcement.id}:`, err),
      ),
    ),
  );

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
 * The single most recent active announcement this user hasn't dismissed —
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
