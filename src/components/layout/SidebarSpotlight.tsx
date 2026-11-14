"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, ArrowRight, CalendarCheck, CalendarDays, Flame, Hourglass, Inbox, PlayCircle, Plus, Sparkles, Ticket, Users, type AppIcon } from "@/components/ui/appIcons";
import { useMeStatus } from "@/components/layout/MeStatusProvider";
import { DiscordIcon } from "@/components/ui/icons";
import { DAILY_GOAL_SECONDS } from "@/lib/fingerPracticeConstants";
import type { SidebarCard } from "@/lib/sidebarCards";

// The cards change slowly (the countdown ticks in the browser), so the server is asked every 3 minutes, and only while the tab is in view
// on a screen wide enough to show the sidebar.
const POLL_MS = 180_000;

/** "in 2 days", "in 3h 20m", "in 12 min", "Starting now". Only called in the browser (after mount). */
function countdown(target: number, now: number, durationMinutes: number): string {
  const ms = target - now;
  if (ms <= -durationMinutes * 60_000) return "Finished";
  if (ms <= 0) return "In progress";
  const mins = Math.ceil(ms / 60_000);
  if (mins <= 1) return "Starting now";
  if (mins < 60) return `in ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `in ${hours}h ${mins % 60}m`;
  const days = Math.floor(hours / 24);
  return `in ${days} day${days === 1 ? "" : "s"} ${hours % 24}h`;
}

function when(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function Shell({ href, icon: Icon, label, tone = "signal", children, cta }: { href?: string; icon: AppIcon; label: string; tone?: "signal" | "warn"; children: ReactNode; cta?: string }) {
  const body = (
    <>
      <span className="flex items-center gap-1.5 px-3 pt-3 text-small font-semibold uppercase tracking-caps text-slate-500">
        <Icon className={`h-3.5 w-3.5 ${tone === "warn" ? "text-red-300" : "text-signal-fg"}`} aria-hidden />
        {label}
      </span>
      <span className="block px-3 pb-3 pt-1.5">
        {children}
        {cta && (
          <span className="mt-2 inline-flex items-center gap-1 text-small font-semibold text-signal-fg">
            {cta}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </span>
        )}
      </span>
    </>
  );
  const cls = "block overflow-hidden rounded-card bg-neu-lift shadow-raised-low";
  return href ? (
    <Link href={href} prefetch className={`press-soft ${cls} hover:shadow-raised-mid focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}>
      {body}
    </Link>
  ) : (
    <div className="lgx-card block overflow-hidden rounded-card">{body}</div>
  );
}

const Big = ({ children }: { children: ReactNode }) => <span className="block text-body font-semibold leading-snug text-slate-50">{children}</span>;
const Sub = ({ children }: { children: ReactNode }) => <span className="mt-0.5 block text-small text-slate-400">{children}</span>;
function Bar({ value }: { value: number }) {
  return (
    <span aria-hidden className="mt-2 block h-1.5 overflow-hidden rounded-full bg-neu-base shadow-pressed-low">
      <span className="block h-full rounded-full bg-signal" style={{ width: `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%` }} />
    </span>
  );
}

function DiscordCard() {
  return (
    <a
      href="/api/discord/connect"
      className="press-soft block overflow-hidden rounded-card bg-neu-lift shadow-raised-low hover:shadow-raised-mid focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span aria-hidden className="link-scene relative flex h-24 items-center justify-center gap-1.5 bg-slate-950">
        <span className="link-star left-[14%] top-[22%]" />
        <span className="link-star left-[82%] top-[30%] [animation-delay:0.7s]" />
        <span className="link-star left-[26%] top-[78%] [animation-delay:1.3s]" />
        <span className="link-star left-[70%] top-[80%] [animation-delay:0.3s]" />
        <span className="link-tile link-tile-a flex h-11 w-11 items-center justify-center rounded-xl bg-discord text-white shadow-raised-mid">
          <DiscordIcon size={24} />
        </span>
        <span className="flex items-center gap-1">
          <span className="link-dot" />
          <span className="link-dot [animation-delay:0.15s]" />
          <span className="link-dot [animation-delay:0.3s]" />
          <span className="link-dot [animation-delay:0.45s]" />
        </span>
        <span className="link-tile link-tile-b flex h-11 w-11 items-center justify-center rounded-xl bg-neu-lift shadow-raised-mid">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-mark.png" alt="" width={32} height={32} className="h-8 w-8 rounded-lg" />
        </span>
      </span>
      <span className="block p-3">
        <span className="block text-small font-semibold text-slate-50">Link your Discord</span>
        <span className="mt-0.5 block text-small text-slate-400">Your private class call opens there before each lesson.</span>
        <span className="mt-2 inline-flex items-center gap-1 text-small font-semibold text-signal-fg">
          Connect Discord
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </span>
      </span>
    </a>
  );
}

type Rail = { icon: AppIcon; label: string; href: string; count?: number; warn?: boolean; dot?: boolean };
type Slot = { id: string; node: (now: number | null) => ReactNode; rail?: Rail };

/** What matters most comes first: a stopped system, things waiting, today's classes, then the gentle nudges. The Discord invitation leads until it is linked. */
const RANK: Record<string, number> = { discord: 0, jobsStopped: 1, needsYou: 2, todayClasses: 3, nextClass: 4, credits: 5, scaleUnlocked: 6, fifthClass: 7, continueLesson: 8, streak: 9, friendsPracticing: 10, scaleWaiting: 11 };

function railFor(card: SidebarCard): Rail | undefined {
  switch (card.kind) {
    case "nextClass":
      return { icon: CalendarCheck, label: "Next class", href: "/lessons", dot: true };
    case "fifthClass":
      return { icon: Plus, label: "Extra class available", href: "/lessons?tab=extra", dot: true };
    case "scaleUnlocked":
      return { icon: Sparkles, label: `${card.scaleCode} is open`, href: `/scales/${card.slug}`, dot: true };
    case "scaleWaiting":
      return { icon: Hourglass, label: "Waiting for your teacher", href: "/roadmap" };
    case "streak":
      return { icon: Flame, label: card.practicedToday ? "Practiced today" : "Practice today", href: "/practice", dot: !card.practicedToday };
    case "continueLesson":
      return { icon: PlayCircle, label: "Continue your lesson", href: `/scales/${card.slug}` };
    case "friendsPracticing":
      return { icon: Users, label: "Friends are practicing", href: "/friends", dot: true };
    case "needsYou":
      return { icon: Inbox, label: `${card.total} waiting`, href: card.items[0]?.href ?? "/admin", count: card.total, warn: true };
    case "todayClasses":
      return { icon: CalendarDays, label: `Today: ${card.count} ${card.count === 1 ? "class" : "classes"}`, href: "/admin/today", count: card.count };
    case "jobsStopped":
      return { icon: AlertTriangle, label: `${card.count} automatic ${card.count === 1 ? "task" : "tasks"} stopped`, href: "/admin/security#tasks", count: card.count, warn: true };
  }
}

function slotFor(card: SidebarCard): Slot {
  const slot = rawSlotFor(card);
  return { ...slot, rail: railFor(card) };
}

function rawSlotFor(card: SidebarCard): Slot {
  switch (card.kind) {
    case "nextClass":
      return {
        id: "nextClass",
        node: (now) => {
          const start = new Date(card.scheduledAt).getTime();
          const joinable = now !== null && start - now <= 15 * 60_000 && now - start < card.durationMinutes * 60_000;
          return (
            <Shell href="/lessons" icon={CalendarCheck} label="Next class" cta={joinable ? "Join class" : "View lesson"}>
              <Big>{now === null ? "Your next class" : countdown(start, now, card.durationMinutes)}</Big>
              <Sub>{now === null ? " " : when(card.scheduledAt)}</Sub>
            </Shell>
          );
        },
      };
    case "fifthClass":
      return {
        id: "fifthClass",
        node: (now) => (
          <Shell href="/lessons?tab=extra" icon={Plus} label="Extra class" cta="Add it">
            <Big>A fifth class fits this month</Big>
            <Sub>
              {now === null ? " " : when(card.scheduledAt)} · ${(card.priceCents / 100).toFixed(card.priceCents % 100 === 0 ? 0 : 2)}
            </Sub>
          </Shell>
        ),
      };
    case "scaleUnlocked":
      return {
        id: "scaleUnlocked",
        node: () => (
          <Shell href={`/scales/${card.slug}`} icon={Sparkles} label="Unlocked" cta="Start">
            <Big>{card.scaleCode} is open</Big>
            <Sub>Your teacher approved the next scale.</Sub>
          </Shell>
        ),
      };
    case "scaleWaiting":
      return {
        id: "scaleWaiting",
        node: () => (
          <Shell href="/roadmap" icon={Hourglass} label="Next scale">
            <Big>{card.scaleCode} is done</Big>
            <Sub>Waiting for your teacher to open the next one.</Sub>
          </Shell>
        ),
      };
    case "streak": {
      const minutes = Math.floor(card.todaySeconds / 60);
      return {
        id: "streak",
        node: () => (
          <Shell href="/practice" icon={Flame} label="Practice" cta={card.practicedToday ? undefined : "Practice now"}>
            <Big>{card.streak > 0 ? `${card.streak}-day streak` : "Start a streak"}</Big>
            <Sub>{card.practicedToday ? "Today's 10 minutes are done." : `${minutes} of ${DAILY_GOAL_SECONDS / 60} min today`}</Sub>
            <Bar value={card.practicedToday ? 1 : card.todaySeconds / DAILY_GOAL_SECONDS} />
          </Shell>
        ),
      };
    }
    case "continueLesson":
      return {
        id: "continueLesson",
        node: () => (
          <Shell href={`/scales/${card.slug}`} icon={PlayCircle} label="Continue" cta="Resume">
            <Big>{card.lessonTitle || `Lesson ${card.lessonNumber}`}</Big>
            <Sub>
              {card.scaleCode} · lesson {card.lessonNumber} of {card.total}
            </Sub>
            <Bar value={card.done / card.total} />
          </Shell>
        ),
      };
    case "friendsPracticing": {
      const more = card.total - card.names.length;
      const list = card.names.join(", ") + (more > 0 ? ` +${more}` : "");
      return {
        id: "friendsPracticing",
        node: () => (
          <Shell href="/friends" icon={Users} label="Friends" cta="See friends">
            <Big>
              <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-green-400 align-middle" aria-hidden />
              {list}
            </Big>
            <Sub>{card.total === 1 ? "is practicing right now." : "are practicing right now."}</Sub>
          </Shell>
        ),
      };
    }
    case "needsYou":
      return {
        id: "needsYou",
        node: () => (
          <Shell icon={Inbox} label="Needs you now">
            <ul className="-mx-1.5 grid gap-0.5">
              {card.items.slice(0, 4).map((item) => (
                <li key={item.href + item.label}>
                  <Link href={item.href} prefetch className="tap flex items-center justify-between gap-2 rounded-control px-1.5 py-1 text-small text-slate-200 hover:bg-slate-800/50">
                    <span className="truncate">{item.label}</span>
                    <span className="rounded-full bg-signal/14 px-2 font-semibold tabular-nums text-signal-fg">{item.count}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Shell>
        ),
      };
    case "todayClasses":
      return {
        id: "todayClasses",
        node: (now) => (
          <Shell href="/admin/today" icon={CalendarDays} label="Today" cta="Open today">
            <Big>
              {card.count} {card.count === 1 ? "class" : "classes"} today
            </Big>
            <Sub>
              {card.next && now !== null
                ? `Next at ${new Date(card.next).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
                : card.next
                  ? " "
                  : "None left to start."}
            </Sub>
          </Shell>
        ),
      };
    case "jobsStopped":
      return {
        id: "jobsStopped",
        node: () => (
          <Shell href="/admin/security#tasks" icon={AlertTriangle} label="System" tone="warn" cta="Look">
            <Big>{card.count === 1 ? "An automatic task stopped" : `${card.count} automatic tasks stopped`}</Big>
            <Sub>Emails, backups or reminders may not be running.</Sub>
          </Shell>
        ),
      };
  }
}

function creditsSlot(credits: number): Slot {
  return {
    id: "credits",
    rail: { icon: Ticket, label: credits <= 0 ? "No class credits left" : "1 class credit left", href: "/lessons?tab=extra", warn: true, dot: true },
    node: () => (
      <Shell href="/lessons?tab=extra" icon={Ticket} label="Credits" cta="Get more">
        <Big>{credits <= 0 ? "No class credits left" : "1 class credit left"}</Big>
        <Sub>Keep your next lessons booked.</Sub>
      </Shell>
    ),
  };
}

/**
 * The bottom of the desktop sidebar: the single most useful card for this person right now, with small dots to step through
 * the others. The Discord invitation always comes first until Discord is linked. Cards are fetched fresh every minute, on
 * every page change and whenever the app announces a change.
 */
export function SidebarSpotlight({
  initial,
  isAdmin,
  mode = "carousel",
  onAttention,
}: {
  initial: SidebarCard[];
  isAdmin: boolean;
  /** "carousel": one card at a time at the foot of the sidebar. "list": every card stacked (the admin's alerts window in the top bar). */
  mode?: "carousel" | "list";
  /** How many cards need attention (a count, a dot or a warning): the badge on the admin's alerts button. */
  onAttention?: (count: number) => void;
}) {
  const pathname = usePathname();
  const status = useMeStatus();
  const [cards, setCards] = useState<SidebarCard[]>(initial);
  const [index, setIndex] = useState(0);
  const [now, setNow] = useState<number | null>(null);
  const firstRun = useRef(true);

  useEffect(() => setCards(initial), [initial]);

  useEffect(() => {
    let alive = true;
    async function load() {
      // The sidebar only exists from lg up: on a phone there is nothing to update, so nothing is asked. The admin's alerts window
      // (list mode) lives in the top bar from md up.
      if (!window.matchMedia(mode === "list" ? "(min-width: 768px)" : "(min-width: 1024px)").matches) return;
      try {
        const res = await fetch("/api/me/sidebar", { cache: "no-store", credentials: "same-origin" });
        if (res.ok && alive) setCards(((await res.json()) as { cards: SidebarCard[] }).cards);
      } catch {
        // Offline or a hiccup: keep the last cards.
      }
    }
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    window.addEventListener("bnp:status-changed", load);
    document.addEventListener("visibilitychange", onVisible);
    // The server already sent the cards with the page, so the first look waits for a page change or the timer.
    if (!firstRun.current) void load();
    firstRun.current = false;
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener("bnp:status-changed", load);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [pathname, mode]);

  // The countdown ticks twice a minute; it starts only in the browser so the server and first paint agree.
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const slots: Slot[] = [];
  if (status && !status.discordConnected) slots.push({ id: "discord", node: () => <DiscordCard />, rail: { icon: Plus, label: "Link your Discord", href: "/api/discord/connect", dot: true } });
  const server = cards.map(slotFor);
  if (!isAdmin && status && status.credits <= 1) {
    const at = server.findIndex((s) => s.id === "nextClass");
    server.splice(at + 1, 0, creditsSlot(status.credits));
  }
  slots.push(...server);
  // Most urgent first, so what needs attention is never hidden behind a gentler card.
  slots.sort((a, b) => (RANK[a.id] ?? 99) - (RANK[b.id] ?? 99));
  const attention = slots.filter((s) => s.rail && ((s.rail.count ?? 0) > 0 || s.rail.dot || s.rail.warn)).length;
  useEffect(() => onAttention?.(attention), [attention, onAttention]);

  if (mode === "list") {
    return slots.length === 0 ? (
      <p className="px-1 py-4 text-center text-small text-slate-400">Nothing needs you right now.</p>
    ) : (
      <div className="grid gap-2">
        {slots.map((s) => (
          <div key={s.id}>{s.node(now)}</div>
        ))}
      </div>
    );
  }
  if (slots.length === 0) return null;

  const current = slots[Math.min(index, slots.length - 1)];
  const rails = slots.filter((s): s is Slot & { rail: Rail } => Boolean(s.rail));
  return (
    <>
    {/* When the sidebar is shrunk to icons: every card is still there as a small icon, with a count or a dot when it needs you. */}
    {rails.length > 0 && (
      <div className="sb-rail mt-auto" aria-label="Alerts">
        {rails.map((s) => {
          const Icon = s.rail.icon;
          const body = (
            <>
              <Icon className={`h-[18px] w-[18px] ${s.rail.warn ? "text-red-300" : "text-slate-300"}`} strokeWidth={1.75} aria-hidden />
              {s.rail.count !== undefined && s.rail.count > 0 ? (
                <span className={`absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-0.5 text-[0.625rem] font-bold leading-none ${s.rail.warn ? "bg-red-500 text-white" : "bg-signal text-slate-950"}`}>{s.rail.count > 9 ? "9+" : s.rail.count}</span>
              ) : s.rail.dot ? (
                <span aria-hidden className="absolute right-1 top-1 h-2 w-2 rounded-full bg-signal" />
              ) : null}
            </>
          );
          const cls = "lgx-btn tap press-soft relative flex h-10 w-10 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
          return s.rail.href.startsWith("/api/") ? (
            <a key={s.id} href={s.rail.href} title={s.rail.label} aria-label={s.rail.label} className={cls}>
              {body}
            </a>
          ) : (
            <Link key={s.id} href={s.rail.href} prefetch title={s.rail.label} aria-label={s.rail.label} className={cls}>
              {body}
            </Link>
          );
        })}
      </div>
    )}
    <div className="sb-spotlight mt-auto">
      <div key={current.id}>{current.node(now)}</div>
      {slots.length > 1 && (
        <div className="mt-2 flex items-center justify-center gap-1" role="tablist" aria-label="Sidebar cards">
          {slots.map((s, i) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={s === current}
              aria-label={`Card ${i + 1} of ${slots.length}`}
              onClick={() => setIndex(i)}
              className="flex h-6 w-6 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className={`block h-1.5 rounded-full transition-[width,background-color] duration-(--dur-base) ease-(--ease-ios) ${s === current ? "w-4 bg-signal" : "w-1.5 bg-slate-600"}`} />
            </button>
          ))}
        </div>
      )}
    </div>
    </>
  );
}
