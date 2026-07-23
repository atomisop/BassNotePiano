"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  fetchNotificationsAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
  type NotificationRow,
} from "@/app/(dashboard)/notification-actions";
import { playNotificationSound } from "@/lib/notification-sound";

const POLL_INTERVAL_MS = 30_000;

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const previousUnreadRef = useRef<number | null>(null);

  async function refresh() {
    const result = await fetchNotificationsAction();
    // Only chime when the count goes up from a known previous value — skips
    // the initial mount (previousUnreadRef still null) and any decrease.
    if (previousUnreadRef.current !== null && result.unreadCount > previousUnreadRef.current) {
      playNotificationSound();
    }
    previousUnreadRef.current = result.unreadCount;

    setUnreadCount(result.unreadCount);
    setNotifications(result.notifications);
    setLoaded(true);
  }

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleToggle() {
    const next = !open;
    setOpen(next);
    if (next && !loaded) await refresh();
  }

  async function handleMarkAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
    await markAllNotificationsReadAction();
  }

  async function handleNotificationClick(notification: NotificationRow) {
    if (notification.read) return;
    setNotifications((prev) => prev.map((n) => (n.id === notification.id ? { ...n, read: true } : n)));
    setUnreadCount((prev) => Math.max(0, prev - 1));
    await markNotificationReadAction(notification.id);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={handleToggle}
        aria-label="Notifications"
        className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-slate-800 text-slate-400 transition hover:border-slate-700 hover:text-slate-200"
      >
        <svg viewBox="0 0 24 24" fill="none" className="h-[18px] w-[18px]">
          <path
            d="M12 3a5 5 0 00-5 5v2.7c0 .57-.19 1.13-.53 1.58L5 14.5c-.94 1.24-.06 3 1.49 3h11.02c1.55 0 2.43-1.76 1.49-3l-1.47-2.22a2.67 2.67 0 01-.53-1.58V8a5 5 0 00-5-5z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path d="M9.5 19.5a2.5 2.5 0 005 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-amber-400 px-1 text-[10px] font-bold text-slate-950">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-11 z-20 w-80 rounded-xl border border-slate-800 bg-slate-950 shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-900 px-4 py-3">
            <p className="text-sm font-medium text-slate-100">Notifications</p>
            {unreadCount > 0 && (
              <button type="button" onClick={handleMarkAllRead} className="text-xs text-amber-300 transition hover:text-amber-200">
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                <span className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-800 text-slate-600">
                  <svg viewBox="0 0 24 24" fill="none" className="h-[18px] w-[18px]">
                    <path
                      d="M12 3a5 5 0 00-5 5v2.7c0 .57-.19 1.13-.53 1.58L5 14.5c-.94 1.24-.06 3 1.49 3h11.02c1.55 0 2.43-1.76 1.49-3l-1.47-2.22a2.67 2.67 0 01-.53-1.58V8a5 5 0 00-5-5z"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinejoin="round"
                    />
                    <path d="M9.5 19.5a2.5 2.5 0 005 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </span>
                <p className="text-xs font-medium text-slate-400">No recent notifications</p>
                <Link
                  href="/account?tab=notifications"
                  onClick={() => setOpen(false)}
                  className="mt-1 text-[11px] text-amber-300 transition hover:text-amber-200"
                >
                  Notification settings
                </Link>
              </div>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => handleNotificationClick(n)}
                  className="flex w-full items-start gap-2.5 border-b border-slate-900 px-4 py-3 text-left transition last:border-b-0 hover:bg-slate-900/60"
                >
                  <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${n.read ? "bg-transparent" : "bg-amber-400"}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-medium text-slate-100">{n.title}</span>
                    {n.body && <span className="mt-0.5 block text-xs text-slate-500">{n.body}</span>}
                    <span className="mt-1 block text-[11px] text-slate-600">{relativeTime(n.createdAt)}</span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
