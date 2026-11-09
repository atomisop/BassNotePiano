"use client";

import { OPEN_NOTIFICATIONS, OPEN_SUPPORT, UNREAD_COUNT, announce, listen } from "@/lib/topBarEvents";
import Link from "next/link";
import { notificationTarget } from "@/lib/notificationTargets";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useSession } from "next-auth/react";
import { useMeStatus } from "@/components/layout/MeStatusProvider";
import { SupportThread } from "@/components/notifications/SupportThread";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  Bell,
  Calendar,
  CheckCheck,
  ChevronRight,
  ClipboardList,
  CreditCard,
  Headset,
  Mail,
  Megaphone,
  MessageSquare,
  Settings,
  Timer,
  Users,
} from "@/components/ui/appIcons";
import {
  fetchNotificationsAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
  type NotificationRow,
} from "@/app/(dashboard)/notification-actions";
import { Tabs } from "@/components/ui/Tabs";
import { markAllMailReadAction } from "@/app/(dashboard)/mail/actions";
import { playNotificationSound } from "@/lib/notification-sound";
import { EASE_IOS, FADE, SPRING } from "@/lib/motionTokens";
import { onChange } from "@/lib/liveEvents";
import { newPaymentToasts } from "@/lib/paymentToasts";
import { toast } from "@/components/ui/Toaster";
import { useDialogFocus } from "@/hooks/useDialogFocus";

const POLL_INTERVAL_MS = 30_000;

// Where clicking a notification should take you, kept close to the
// component since it's purely presentation-layer routing, not shared
// business logic. Falls back to no link (just marks read) for anything
// unmapped, e.g. NEW_MESSAGE never reaches here (excluded upstream).
function notificationHref(type: string): string | null {
  return notificationTarget(type);
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

// ---------------------------------------------------------------------------
// Grouping: Today/Yesterday/This week/Earlier sections, and within each,
// consecutive notifications from the same category collapsed into one
// stacked card (iOS's own Notification Center: grouped by app, ordered by
// recency). There's no per-notification sender in the data model (a
// friend request doesn't record which friend, e.g.), so "who sent it" here
// means a recognizable category (Billing, Friends, Announcements) rather
// than a literal name.
// ---------------------------------------------------------------------------

// Same category set as before, drawn with the app's shared icons
// (components/ui/appIcons.tsx) instead of hand-rolled inline SVG paths. The category-to-icon MAPPING below
// (TYPE_CATEGORY) is unchanged; only which icon component renders per key.
const CATEGORY_ICONS = {
  billing: CreditCard,
  account: Settings,
  friends: Users,
  reminders: Timer,
  registrations: ClipboardList,
  bookings: Calendar,
  announcements: Megaphone,
  support: Headset,
  // Added on main for the admin feedback inbox (PLAN_CANCELLATION_FEEDBACK),
  // a hand-rolled SVG path there, swapped to the shared MessageSquare icon here
  // to match every other category icon in this restyle.
  feedback: MessageSquare,
  messages: Mail,
} as const;

type CategoryKey = keyof typeof CATEGORY_ICONS;

const TYPE_CATEGORY: Partial<Record<string, { key: CategoryKey; label: string }>> = {
  PAYMENT_APPROVED: { key: "billing", label: "Billing" },
  PAYMENT_REJECTED: { key: "billing", label: "Billing" },
  PAYMENT_AMOUNT_MISMATCH: { key: "billing", label: "Billing" },
  CURRICULUM_ACCESS_GRANTED: { key: "billing", label: "Billing" },
  CURRICULUM_ACCESS_REVOKED: { key: "billing", label: "Billing" },
  CREDIT_ADJUSTED: { key: "billing", label: "Billing" },
  PAYMENT_PLAN_INSTALLMENT_DUE: { key: "billing", label: "Billing" },
  PAYMENT_PLAN_INSTALLMENT_OVERDUE: { key: "billing", label: "Billing" },
  PAYMENT_PLAN_COMPLETED: { key: "billing", label: "Billing" },
  PAYMENT_PLAN_CANCELED: { key: "billing", label: "Billing" },
  CREDITS_EXPIRED: { key: "billing", label: "Billing" },
  CREDITS_EXPIRING_SOON: { key: "billing", label: "Billing" },
  RESERVED_SLOT_UNAVAILABLE: { key: "billing", label: "Billing" },
  PAYMENT_RECEIVED: { key: "billing", label: "Billing" },
  PAYMENT_PLAN_UPDATED: { key: "billing", label: "Billing" },
  SLOT_WAITLIST_OPENED: { key: "billing", label: "Billing" },
  BOOKING_REQUEST_RECEIVED: { key: "bookings", label: "Bookings" },
  BOOKING_REQUEST_DECLINED: { key: "bookings", label: "Bookings" },
  TRIAL_ENDING: { key: "billing", label: "Billing" },
  ROLE_UPDATED: { key: "account", label: "Account" },
  ACCOUNT_UPDATE: { key: "account", label: "Account" },
  PARENT_LINK_REQUEST: { key: "account", label: "Account" },
  PARENT_LINK_ACCEPTED: { key: "account", label: "Account" },
  LESSON_BOOKING_CONFIRMED: { key: "bookings", label: "Bookings" },
  ATTENDANCE_RECORDED: { key: "bookings", label: "Bookings" },
  FRIEND_REQUEST_RECEIVED: { key: "friends", label: "Friends" },
  FRIEND_REQUEST_ACCEPTED: { key: "friends", label: "Friends" },
  FRIEND_NUDGE: { key: "reminders", label: "Reminders" },
  PRACTICE_REMINDER: { key: "reminders", label: "Reminders" },
  BANNER_PHONE: { key: "reminders", label: "Reminders" },
  BANNER_DISCORD: { key: "reminders", label: "Reminders" },
  BANNER_PRACTICE: { key: "reminders", label: "Reminders" },
  CLASS_REGISTRATION_RECEIVED: { key: "registrations", label: "Class registrations" },
  CLASS_REGISTRATION_APPROVED: { key: "registrations", label: "Class registrations" },
  CLASS_REGISTRATION_REJECTED: { key: "registrations", label: "Class registrations" },
  LESSON_BOOKING_RECEIVED: { key: "bookings", label: "Bookings" },
  LESSON_BOOKING_CANCELED: { key: "bookings", label: "Bookings" },
  ANNOUNCEMENT: { key: "announcements", label: "Announcements" },
  ASSISTANT_ESCALATION: { key: "support", label: "Support requests" },
  SUPPORT_TRANSFER: { key: "support", label: "Support requests" },
  PLAN_CANCELLATION_FEEDBACK: { key: "feedback", label: "Feedback" },
  // Mail kinds: the Mail tab groups its messages the same way.
  ADMIN_MESSAGE: { key: "messages", label: "Messages" },
  PAYMENT: { key: "billing", label: "Payments" },
  BILLING: { key: "billing", label: "Billing" },
};

function categoryFor(type: string): { key: CategoryKey; label: string } {
  return TYPE_CATEGORY[type] ?? { key: "account", label: "Updates" };
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

const SECTION_ORDER = ["Today", "Yesterday", "This week", "Earlier"] as const;
type SectionLabel = (typeof SECTION_ORDER)[number];

function sectionFor(iso: string): SectionLabel {
  const diffDays = Math.round((startOfDay(new Date()) - startOfDay(new Date(iso))) / 86_400_000);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return "This week";
  return "Earlier";
}

interface NotificationCluster {
  /** The most recent item's own id, stable across polls as long as nothing in the cluster changes. */
  key: string;
  categoryKey: CategoryKey;
  categoryLabel: string;
  items: NotificationRow[];
}

interface NotificationSection {
  label: SectionLabel;
  clusters: NotificationCluster[];
}

/**
 * `notifications` arrives newest-first already. Bucket by day, then within
 * each day collapse consecutive same-category runs into one cluster:
 * consecutive, not "every match anywhere in the list," so two Billing
 * notifications either side of a Friends one stay two separate entries in
 * their real chronological order, rather than merging out of sequence.
 */
function groupNotifications(notifications: NotificationRow[]): NotificationSection[] {
  const byDay = new Map<SectionLabel, NotificationRow[]>();
  for (const n of notifications) {
    const label = sectionFor(n.createdAt);
    (byDay.get(label) ?? byDay.set(label, []).get(label)!).push(n);
  }

  const sections: NotificationSection[] = [];
  for (const label of SECTION_ORDER) {
    const items = byDay.get(label);
    if (!items?.length) continue;

    const clusters: NotificationCluster[] = [];
    for (const n of items) {
      const category = categoryFor(n.type);
      const current = clusters[clusters.length - 1];
      if (current?.categoryKey === category.key) {
        current.items.push(n);
      } else {
        clusters.push({ key: n.id, categoryKey: category.key, categoryLabel: category.label, items: [n] });
      }
    }
    sections.push({ label, clusters });
  }
  return sections;
}

/** One notification, however it's reached: a top-level row or expanded out of a stack. Pulled out so both places render it identically. */
function NotificationEntry({ notification, onClick }: { notification: NotificationRow; onClick: (n: NotificationRow) => void }) {
  // Cards get their own bg-slate-900 rather than the panel's bg-surface,
  // the two were identical before, which is exactly why every row read as
  // one uniform gray field with nothing to tell "card" from "page." Unread
  // rows layer a real accent tint plus a colored left edge on top of that
  // dark card. Uses --signal (the logo orange), not --c-s-50: that is this
  // theme's near-white TEXT ramp, not an accent at all, which is why unread
  // rows used to read as white instead of highlighted.
  const itemClassName = `flex w-full items-start gap-3 rounded-xl border px-4 py-3.5 text-left transition ${
    notification.read
      ? "border-transparent bg-neu-base shadow-raised-low"
      : "border-l-[3px] border-y border-r border-y-signal/30 border-r-signal/30 border-l-signal bg-signal/14 hover:bg-signal/20"
  }`;
  const inner = (
    <>
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${notification.read ? "bg-transparent" : "bg-signal"}`} />
      <span className="min-w-0 flex-1">
        <span className="block text-small font-medium text-slate-100">{notification.title}</span>
        {notification.body && <span className="mt-0.5 block text-small text-slate-500">{notification.body}</span>}
        <span className="mt-1.5 block text-small text-slate-500">{relativeTime(notification.createdAt)}</span>
      </span>
    </>
  );
  const href = notification.href ?? notificationHref(notification.type);

  if (href) {
    return (
      <Link href={href} onClick={() => onClick(notification)} className={itemClassName}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={() => onClick(notification)} className={itemClassName}>
      {inner}
    </button>
  );
}

/**
 * A collapsed run of same-category notifications, styled as a physical
 * stack the way iOS groups notifications from one app: two faint card
 * edges peek out behind the front one, capped at two regardless of how
 * many are actually in the group (a third edge wouldn't read as "more,"
 * just cluttered). Tapping the card expands it into the individual
 * entries beneath, each still independently clickable/markable-read.
 */
function NotificationGroup({
  cluster,
  expanded,
  onToggle,
  onItemClick,
}: {
  cluster: NotificationCluster;
  expanded: boolean;
  onToggle: () => void;
  onItemClick: (n: NotificationRow) => void;
}) {
  const { items, categoryKey, categoryLabel } = cluster;
  const latest = items[0]!;
  const hasUnread = items.some((n) => !n.read);

  return (
    <div>
      <div className="relative">
        {!expanded && (
          <>
            <div className="absolute inset-x-2 -top-1.5 h-full rounded-xl bg-neu-base shadow-raised-low" aria-hidden />
            {items.length > 2 && (
              <div className="absolute inset-x-4 -top-3 h-full rounded-xl bg-neu-base shadow-raised-low" aria-hidden />
            )}
          </>
        )}
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className={`relative flex w-full items-start gap-3 rounded-xl border px-4 py-3.5 text-left transition ${
            hasUnread
              ? "border-l-[3px] border-y border-r border-y-signal/30 border-r-signal/30 border-l-signal bg-signal/14 hover:bg-signal/20"
              : "border-transparent bg-neu-base shadow-raised-low"
          }`}
        >
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-signal/15 text-signal-fg">
            {(() => {
              const Icon = CATEGORY_ICONS[categoryKey];
              return <Icon className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />;
            })()}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="text-small font-medium text-slate-100">{categoryLabel}</span>
              <span className="rounded-full bg-neu-base shadow-pressed-low px-1.5 py-0.5 text-small font-semibold text-slate-400">{items.length}</span>
              {hasUnread && <span className="h-2 w-2 shrink-0 rounded-full bg-signal" aria-hidden />}
            </span>
            <span className="mt-0.5 block truncate text-small text-slate-500">{latest.title}</span>
            <span className="mt-1.5 block text-small text-slate-500">{relativeTime(latest.createdAt)}</span>
          </span>
          <ChevronRight
            className={`mt-1 h-4 w-4 shrink-0 text-slate-500 transition-transform ${expanded ? "rotate-90" : ""}`}
            strokeWidth={1.75}
            aria-hidden
          />
        </button>
      </div>

      {/* Was a plain conditional render, instant, no transition at all,
          which read as a snap/cut rather than something opening. Animates
          height + opacity now so expanding a stack visibly unfolds. */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.32, ease: EASE_IOS }}
            className="overflow-hidden"
          >
            <div className="mt-2 space-y-2 border-l-2 border-ink/10 pl-3">
              {items.map((n, i) => (
                <div key={n.id} style={{ "--i": i } as CSSProperties} className="stagger-item">
                  <NotificationEntry notification={n} onClick={onItemClick} />
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}


type InboxTab = "NOTIFICATIONS" | "MAIL" | "SUPPORT";

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const inboxRef = useDialogFocus<HTMLDivElement>(open);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [mailUnreadCount, setMailUnreadCount] = useState(0);
  const [mail, setMail] = useState<NotificationRow[]>([]);
  const [tab, setTab] = useState<InboxTab>("NOTIFICATIONS");
  // The Support tab is for students; the team answers from Admin > Support Chat. Its count is part of the shared status.
  const { data: session } = useSession();
  const hasSupport = session?.user?.role !== "ADMIN";
  const supportUnread = useMeStatus()?.unreadMessages ?? 0;
  const badgeCount = unreadCount + mailUnreadCount + (hasSupport ? supportUnread : 0);
  const [mounted, setMounted] = useState(false);
  // Which stacked groups are currently expanded, keyed by NotificationCluster.key.
  // Left as-is across polls/reopens rather than reset, so an in-progress poll
  // tick or closing and reopening the panel doesn't collapse something the
  // student just opened.
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const previousUnreadRef = useRef<number | null>(null);
  // Every notice this tab has already looked at; null until the first poll, which only fills it.
  const seenNoticesRef = useRef<Set<string> | null>(null);

  function toggleGroup(key: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // Portals need a real document, which only exists client-side, the
  // notification panel would otherwise crash during SSR.
  useEffect(() => setMounted(true), []);

  async function refresh() {
    // Caught, not left to throw: this runs unattended on a 30s interval, and
    // the underlying network call has no way to guarantee success. A phone
    // or tablet getting backgrounded mid-request is a routine, expected way
    // for this to fail (confirmed in production: an iPad's "Load failed" on
    // this exact call, from an in-flight fetch the OS killed when the tab
    // was suspended), not a real bug worth surfacing. The next poll 30s
    // later just tries again, same as this whole mechanism already assumes.
    try {
      const result = await fetchNotificationsAction();
      // Only chime when the count goes up from a known previous value.
      // Skips the initial mount (previousUnreadRef still null) and any
      // decrease.
      const total = result.unreadCount + result.mailUnreadCount;
      if (previousUnreadRef.current !== null && total > previousUnreadRef.current) {
        playNotificationSound();
      }
      previousUnreadRef.current = total;

      // A payment that clears (or is turned down) while they are on another page still tells them, as a toast.
      const { toasts, seen } = newPaymentToasts(result.notifications, seenNoticesRef.current);
      seenNoticesRef.current = seen;
      for (const t of toasts) toast[t.kind](t.title, { description: t.description });

      setUnreadCount(result.unreadCount);
      setNotifications(result.notifications);
      setMailUnreadCount(result.mailUnreadCount);
      setMail(result.mail);
    } catch (err) {
      console.error("Notification poll failed (non-blocking, will retry):", err);
    }
  }

  // The profile menu (the only way in on phones) opens this panel, and shows this count on the profile picture.
  useEffect(() => listen(OPEN_NOTIFICATIONS, () => setOpen(true)), []);
  useEffect(
    () =>
      listen(OPEN_SUPPORT, () => {
        setTab("SUPPORT");
        setOpen(true);
      }),
    [],
  );
  useEffect(() => announce(UNREAD_COUNT, badgeCount), [badgeCount]);

  useEffect(() => {
    refresh();
    // Skips the network call entirely while the tab is backgrounded, rather
    // than firing it anyway and letting it fail: cuts battery/data use for
    // every signed-in user, not just a fix for the one iPad case above, and
    // there's nothing useful to show in a hidden tab regardless. Catches up
    // immediately on return via the visibilitychange listener below, so
    // coming back to the tab doesn't wait out a stale interval first.
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, POLL_INTERVAL_MS);

    function handleVisibility() {
      if (document.visibilityState === "visible") refresh();
    }
    document.addEventListener("visibilitychange", handleVisibility);
    const stopListening = onChange("notifications", refresh);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
      stopListening();
    };
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
    // Optimistic: if the call fails, resync from the server so the badge
    // doesn't claim everything is read when it isn't.
    if (tab === "MAIL") {
      setMail((prev) => prev.map((n) => ({ ...n, read: true })));
      setMailUnreadCount(0);
      try {
        await markAllMailReadAction();
      } catch {
        await refresh();
      }
      return;
    }
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
    try {
      await markAllNotificationsReadAction();
    } catch {
      await refresh();
    }
  }

  // A mail row opens its own message page, which marks it read on the server.
  function handleMailClick(message: NotificationRow) {
    setOpen(false);
    if (message.read) return;
    setMail((prev) => prev.map((n) => (n.id === message.id ? { ...n, read: true } : n)));
    setMailUnreadCount((prev) => Math.max(0, prev - 1));
  }

  async function handleNotificationClick(notification: NotificationRow) {
    setOpen(false);
    if (notification.read) return;
    setNotifications((prev) => prev.map((n) => (n.id === notification.id ? { ...n, read: true } : n)));
    setUnreadCount((prev) => Math.max(0, prev - 1));
    try {
      await markNotificationReadAction(notification.id);
    } catch {
      await refresh();
    }
  }

  const shown = tab === "MAIL" ? mail : notifications;
  const onItem = tab === "MAIL" ? handleMailClick : handleNotificationClick;
  const supportOpen = open && tab === "SUPPORT" && hasSupport;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={badgeCount > 0 ? `Notifications, mail and support, ${badgeCount} unread` : "Notifications, mail and support"}
        aria-expanded={open}
        data-tour="notification-bell"
        className={`tap press relative flex h-9 w-9 items-center justify-center rounded-full bg-neu-base ${
          open
            ? "text-signal-fg shadow-pressed-low"
            : "text-slate-400 shadow-raised-low hover:text-slate-200 hover:shadow-raised-mid active:shadow-pressed-low"
        }`}
      >
        <Bell size={18} strokeWidth={1.5} />
        {badgeCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-signal px-1 text-small font-bold text-slate-950">
            {badgeCount > 9 ? "9+" : badgeCount}
          </span>
        )}
      </button>

      {mounted &&
        createPortal(
          <AnimatePresence>
            {open && (
              // Same shape as the Edit profile drawer (SlideOverPanel): a dimmed
              // strip stays on the left, tapping it closes the panel, and the
              // panel itself only takes part of the screen (never full width).
              <motion.div
                className="kb-fit fixed inset-x-0 top-0 z-50 flex h-[100svh] w-full justify-end"
                initial="hidden"
                animate="visible"
                exit="hidden"
              >
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={FADE}
                  className="absolute inset-0 bg-scrim/40"
                  onClick={() => setOpen(false)}
                  aria-hidden
                />
                <motion.div
                  initial={{ x: "100%" }}
                  animate={{ x: 0 }}
                  exit={{ x: "100%" }}
                  transition={SPRING.smooth}
                  ref={inboxRef}
                  tabIndex={-1}
                  role="dialog"
                  aria-modal="true"
                  aria-label="Inbox"
                  style={{ willChange: "transform" }}
                  className="relative flex h-full w-[94%] max-w-md flex-col border-l border-ink/10 bg-surface min-[420px]:w-[86%]"
                >
                <div className="flex items-center gap-4 border-b border-ink/10 px-6 py-5">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label="Back"
                    className="tap flex h-9 w-9 items-center justify-center rounded-full text-slate-300 transition bg-neu-base shadow-raised-low hover:shadow-raised-mid active:shadow-pressed-low"
                  >
                    <ArrowLeft size={18} strokeWidth={1.75} />
                  </button>
                  <h1 className="font-hero text-hero font-bold text-balance text-slate-50">Inbox</h1>
                  {tab !== "SUPPORT" && (tab === "MAIL" ? mailUnreadCount : unreadCount) > 0 && (
                    <button
                      type="button"
                      onClick={handleMarkAllRead}
                      className="ml-auto inline-flex items-center gap-1.5 text-small text-signal-fg transition hover:opacity-70"
                    >
                      <CheckCheck size={14} strokeWidth={2} />
                      Mark all read
                    </button>
                  )}
                </div>

                <div className="border-b border-ink/10 px-4 py-3 min-[420px]:px-6">
                  <Tabs<InboxTab>
                    label="Inbox"
                    value={tab}
                    onChange={setTab}
                    items={[
                      { id: "NOTIFICATIONS", label: "Notifications", count: unreadCount },
                      { id: "MAIL", label: "Mail", count: mailUnreadCount },
                      ...(hasSupport ? [{ id: "SUPPORT" as const, label: "Support", count: supportUnread }] : []),
                    ]}
                  />
                </div>

                {/* overscroll-contain: same fix as SlideOverPanel's own
                    content div, for the identical reason. This list sits
                    below a static header (Back/Notifications/Mark all
                    read above) in a panel portaled straight to
                    document.body, so an uncontained rubber-band bounce
                    here can visibly slide over that header for an instant
                    on the way back from the bottom. */}
                {tab === "SUPPORT" && hasSupport ? (
                  <div className="mx-auto min-h-0 w-full max-w-xl flex-1">
                    <SupportThread active={supportOpen} />
                  </div>
                ) : (
                <div className="mx-auto w-full max-w-xl flex-1 overflow-y-auto overscroll-contain px-6 py-6">
                  {shown.length === 0 ? (
                    <div className="flex flex-col items-center gap-3 pt-20 text-center">
                      <span className="flex h-14 w-14 items-center justify-center rounded-full text-slate-500 bg-neu-base shadow-raised-low hover:shadow-raised-mid active:shadow-pressed-low">
                        <Bell size={24} strokeWidth={1.5} />
                      </span>
                      <p className="text-small font-medium text-slate-400">{tab === "MAIL" ? "No mail yet." : "No notifications yet."}</p>
                      {tab === "NOTIFICATIONS" && (
                        <Link
                          href="/account?tab=notifications"
                          onClick={() => setOpen(false)}
                          className="text-small text-signal-fg transition hover:opacity-70"
                        >
                          Notification settings
                        </Link>
                      )}
                    </div>
                  ) : (
                    // No backdrop-blur anywhere below: this list sits inside
                    // the already near-opaque panel above, so there's nothing
                    // left behind it to blur. Every row/card paid full blur
                    // cost for zero visible frosting; across a scrolling list
                    // plus expanded stacks, that added up fast.
                    <div className="space-y-5">
                      {groupNotifications(shown).map((section) => (
                        <div key={section.label}>
                          <p className="mb-2 px-1 text-small font-medium uppercase tracking-caps text-slate-500">{section.label}</p>
                          <div className="space-y-2">
                            {section.clusters.map((cluster) =>
                              cluster.items.length === 1 ? (
                                <NotificationEntry key={cluster.items[0]!.id} notification={cluster.items[0]!} onClick={onItem} />
                              ) : (
                                <NotificationGroup
                                  key={cluster.key}
                                  cluster={cluster}
                                  expanded={expandedGroups.has(cluster.key)}
                                  onToggle={() => toggleGroup(cluster.key)}
                                  onItemClick={onItem}
                                />
                              ),
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                )}
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}
