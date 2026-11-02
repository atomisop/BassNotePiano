"use server";

import { getServerAuthSession } from "@/lib/auth";
import { getUnreadCount, getRecentNotifications, markAllNotificationsRead, markNotificationRead } from "@/lib/notifications";
import { notificationTarget } from "@/lib/notificationTargets";
import { dismissAnnouncement } from "@/lib/announcements";
import { getMailUnreadCount, listMail } from "@/lib/mail";

export interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string | null;
  read: boolean;
  createdAt: string;
  /** Where tapping it goes, when it is not decided by the type (mail opens its own message). */
  href?: string;
}

export async function fetchNotificationsAction(): Promise<{
  unreadCount: number;
  notifications: NotificationRow[];
  mailUnreadCount: number;
  mail: NotificationRow[];
}> {
  const session = await getServerAuthSession();
  if (!session?.user) return { unreadCount: 0, notifications: [], mailUnreadCount: 0, mail: [] };

  const [unreadCount, rows, mailUnreadCount, mailRows] = await Promise.all([
    getUnreadCount(session.user.id),
    getRecentNotifications(session.user.id),
    getMailUnreadCount(session.user.id),
    listMail(session.user.id, 40),
  ]);

  return {
    unreadCount,
    mailUnreadCount,
    mail: mailRows.map((m) => ({
      id: m.id,
      type: m.kind,
      title: m.title,
      body: m.body,
      read: m.readAt !== null,
      createdAt: m.createdAt.toISOString(),
      href: `/mail/${m.id}`,
    })),
    notifications: rows.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      read: n.readAt !== null,
      createdAt: n.createdAt.toISOString(),
      href: notificationTarget(n.type, n.href) ?? undefined,
    })),
  };
}

export async function markAllNotificationsReadAction(): Promise<void> {
  const session = await getServerAuthSession();
  if (!session?.user) return;
  await markAllNotificationsRead(session.user.id);
}

export async function markNotificationReadAction(id: string): Promise<void> {
  const session = await getServerAuthSession();
  if (!session?.user) return;
  await markNotificationRead(session.user.id, id);
}

export async function dismissAnnouncementAction(announcementId: string): Promise<void> {
  const session = await getServerAuthSession();
  if (!session?.user) return;
  await dismissAnnouncement(session.user.id, announcementId);
}
