"use server";

import { getServerAuthSession } from "@/lib/auth";
import { getUnreadCount, getRecentNotifications, markAllNotificationsRead, markNotificationRead } from "@/lib/notifications";
import { dismissAnnouncement } from "@/lib/announcements";
import { getMailUnreadCount, listMail } from "@/lib/mail";
import { getTotalUnreadMessageCount } from "@/lib/messages";
import { getTotalUnreadGroupMessageCount } from "@/lib/groupMessages";

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

// AppDock's own message badge used to be a plain server-rendered prop from
// the dashboard layout, computed once per request — so reading a message
// never cleared it until the next full navigation re-ran that layout (a
// client-side route change inside the same layout doesn't re-fetch it).
// Polled client-side now instead, same shape as fetchNotificationsAction
// above.
export async function fetchUnreadMessageCountAction(): Promise<number> {
  const session = await getServerAuthSession();
  if (!session?.user) return 0;
  const [direct, group] = await Promise.all([
    getTotalUnreadMessageCount(session.user.id),
    getTotalUnreadGroupMessageCount(session.user.id),
  ]);
  return direct + group;
}
