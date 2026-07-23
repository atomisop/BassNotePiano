"use server";

import { getServerAuthSession } from "@/lib/auth";
import { getUnreadCount, getRecentNotifications, markAllNotificationsRead, markNotificationRead } from "@/lib/notifications";

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
