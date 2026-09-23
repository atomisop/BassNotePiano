"use server";

import { getServerAuthSession } from "@/lib/auth";
import { getUnreadCount, getRecentNotifications, markAllNotificationsRead, markNotificationRead } from "@/lib/notifications";
import { dismissAnnouncement } from "@/lib/announcements";
import { getTotalUnreadMessageCount } from "@/lib/messages";
import { getTotalUnreadGroupMessageCount } from "@/lib/groupMessages";

export interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string | null;
  read: boolean;
  createdAt: string;
}

export async function fetchNotificationsAction(): Promise<{ unreadCount: number; notifications: NotificationRow[] }> {
  const session = await getServerAuthSession();
  if (!session?.user) return { unreadCount: 0, notifications: [] };

  const [unreadCount, rows] = await Promise.all([
    getUnreadCount(session.user.id),
    getRecentNotifications(session.user.id),
  ]);

  return {
    unreadCount,
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
