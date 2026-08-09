"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  fetchNotificationsAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
  type NotificationRow,
} from "@/app/(dashboard)/notification-actions";
import { playNotificationSound } from "@/lib/notification-sound";

const POLL_INTERVAL_MS = 30_000;

// Where clicking a notification should take you — kept close to the
// component since it's purely presentation-layer routing, not shared
// business logic. Falls back to no link (just marks read) for anything
// unmapped, e.g. NEW_MESSAGE never reaches here (excluded upstream).
function notificationHref(type: string): string | null {
  switch (type) {
    case "FRIEND_REQUEST_RECEIVED":
      return "/friends#requests";
    case "FRIEND_REQUEST_ACCEPTED":
      return "/friends";
    case "PAYMENT_APPROVED":
    case "PAYMENT_REJECTED":
      return "/billing/history";
    case "ROLE_UPDATED":
      return "/admin";
    case "PRACTICE_REMINDER":
      return "/dashboard";
    case "CLASS_REGISTRATION_RECEIVED":
    case "CLASS_REGISTRATION_APPROVED":
    case "CLASS_REGISTRATION_REJECTED":
      return "/admin/students";
    case "LESSON_BOOKING_RECEIVED":
      return "/admin/bookings";
    case "LESSON_BOOKING_CANCELED":
      return "/lessons";
    case "ANNOUNCEMENT":
      return "/dashboard";
    default:
      return null;
  }
}

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

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-[18px] w-[18px]">
      <path
        d="M12 3a5 5 0 00-5 5v2.7c0 .57-.19 1.13-.53 1.58L5 14.5c-.94 1.24-.06 3 1.49 3h11.02c1.55 0 2.43-1.76 1.49-3l-1.47-2.22a2.67 2.67 0 01-.53-1.58V8a5 5 0 00-5-5z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M9.5 19.5a2.5 2.5 0 005 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [mounted, setMounted] = useState(false);
  const previousUnreadRef = useRef<number | null>(null);

  // Portals need a real document, which only exists client-side — the
  // notification panel would otherwise crash during SSR.
  useEffect(() => setMounted(true), []);

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
  }

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  async function handleMarkAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
    await markAllNotificationsReadAction();
  }

  async function handleNotificationClick(notification: NotificationRow) {
    setOpen(false);
    if (notification.read) return;
    setNotifications((prev) => prev.map((n) => (n.id === notification.id ? { ...n, read: true } : n)));
    setUnreadCount((prev) => Math.max(0, prev - 1));
    await markNotificationReadAction(notification.id);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Notifications"
        data-tour="notification-bell"
        className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-slate-400 backdrop-blur-md transition hover:border-white/20 hover:bg-white/5 hover:text-slate-200"
      >
        <BellIcon />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-amber-400 px-1 text-[10px] font-bold text-slate-950">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {mounted &&
        createPortal(
          <AnimatePresence>
            {open && (
              <motion.div
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                transition={{ type: "spring", stiffness: 320, damping: 34 }}
                // No backdrop-blur: 95% opaque already reads solid, and this
                // panel scrolls its own notification list underneath it, so
                // dropping the blur removes a heavy repaint on every scroll
                // frame in here, not just during the slide-in. (Was
                // bg-slate-950/98 — that opacity value silently produced no
                // CSS at all in this Tailwind setup, so the panel was
                // actually fully transparent this whole time and only
                // "looked" solid because of the blur; /95 is a real, working
                // value and fixes that too.)
                style={{ willChange: "transform" }}
                className="fixed inset-0 z-50 flex flex-col bg-slate-950/95"
              >
                <div className="flex items-center gap-4 border-b border-white/10 px-6 py-5">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label="Back"
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-slate-300 transition hover:border-white/20 hover:bg-white/5"
                  >
                    <svg viewBox="0 0 24 24" fill="none" className="h-[18px] w-[18px]">
                      <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-amber-400/80">Inbox</p>
                    <h1 className="font-serif text-lg text-slate-50">Notifications</h1>
                  </div>
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={handleMarkAllRead}
                      className="ml-auto text-xs text-amber-300 transition hover:text-amber-200"
                    >
                      Mark all read
                    </button>
                  )}
                </div>

                <div className="mx-auto w-full max-w-xl flex-1 overflow-y-auto px-6 py-6">
                  {notifications.length === 0 ? (
                    <div className="flex flex-col items-center gap-3 pt-20 text-center">
                      <span className="flex h-14 w-14 items-center justify-center rounded-full border border-white/10 text-slate-600">
                        <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6">
                          <path
                            d="M12 3a5 5 0 00-5 5v2.7c0 .57-.19 1.13-.53 1.58L5 14.5c-.94 1.24-.06 3 1.49 3h11.02c1.55 0 2.43-1.76 1.49-3l-1.47-2.22a2.67 2.67 0 01-.53-1.58V8a5 5 0 00-5-5z"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinejoin="round"
                          />
                          <path d="M9.5 19.5a2.5 2.5 0 005 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                      </span>
                      <p className="text-sm font-medium text-slate-400">You're all caught up — no notifications yet.</p>
                      <Link
                        href="/account?tab=notifications"
                        onClick={() => setOpen(false)}
                        className="text-xs text-amber-300 transition hover:text-amber-200"
                      >
                        Notification settings
                      </Link>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {notifications.map((n) => {
                        // No backdrop-blur — this row sits inside the already
                        // near-opaque panel above, so there's nothing left
                        // behind it to blur. Each row paid full blur cost for
                        // zero visible frosting; with up to 15 rows in a
                        // scrolling list, that added up fast.
                        const itemClassName =
                          "flex w-full items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3.5 text-left transition hover:bg-white/5";
                        const inner = (
                          <>
                            <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${n.read ? "bg-transparent" : "bg-amber-400"}`} />
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-medium text-slate-100">{n.title}</span>
                              {n.body && <span className="mt-0.5 block text-sm text-slate-500">{n.body}</span>}
                              <span className="mt-1.5 block text-xs text-slate-600">{relativeTime(n.createdAt)}</span>
                            </span>
                          </>
                        );
                        const href = notificationHref(n.type);

                        if (href) {
                          return (
                            <Link key={n.id} href={href} onClick={() => handleNotificationClick(n)} className={itemClassName}>
                              {inner}
                            </Link>
                          );
                        }
                        return (
                          <button key={n.id} type="button" onClick={() => handleNotificationClick(n)} className={itemClassName}>
                            {inner}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}
