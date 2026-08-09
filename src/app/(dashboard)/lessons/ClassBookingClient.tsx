"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { bookClassAction, cancelClassBookingAction } from "./actions";

interface OccurrenceRow {
  scheduleId: string;
  label: string | null;
  dayOfWeek: number;
  durationMin: number;
  creditCost: number;
  occurrenceDateMs: number;
  scheduledAt: string;
  seatsBooked: number;
  seatsLeft: number;
  isFull: boolean;
}

interface BookingRow {
  id: string;
  label: string | null;
  scheduledAt: string;
  creditsSpent: number;
  status: "SCHEDULED" | "CANCELED" | "COMPLETED";
  refunded: boolean;
  attendance: "PRESENT" | "NO_SHOW" | null;
  canceledReason: string | null;
}

const STATUS_LABEL: Record<BookingRow["status"], string> = {
  SCHEDULED: "Scheduled",
  COMPLETED: "Completed",
  CANCELED: "Canceled",
};

const STATUS_STYLE: Record<BookingRow["status"], string> = {
  SCHEDULED: "bg-amber-400/15 text-amber-300",
  COMPLETED: "bg-emerald-400/15 text-emerald-300",
  CANCELED: "bg-slate-800 text-slate-500",
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function formatDuration(min: number) {
  return min >= 60 ? `${min / 60} hr${min > 60 ? "s" : ""}` : `${min} min`;
}

/** Weekday + date only — the time is shown separately as its own column. */
function formatOccurrenceDay(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

function formatOccurrenceTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/**
 * Buckets upcoming occurrences into "This week" / "Next week" / "Later".
 * A flat list of seven near-identical rows gave the reader nothing to
 * navigate by; a week boundary is the unit people actually plan in.
 */
function groupOccurrencesByWeek(rows: OccurrenceRow[]): { key: string; label: string; rows: OccurrenceRow[] }[] {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const WEEK = 7 * 24 * 60 * 60 * 1000;

  const buckets: Record<string, OccurrenceRow[]> = { this: [], next: [], later: [] };
  for (const row of rows) {
    const delta = new Date(row.scheduledAt).getTime() - startOfToday;
    if (delta < WEEK) buckets.this.push(row);
    else if (delta < WEEK * 2) buckets.next.push(row);
    else buckets.later.push(row);
  }

  return [
    { key: "this", label: "This week", rows: buckets.this },
    { key: "next", label: "Next week", rows: buckets.next },
    { key: "later", label: "Later", rows: buckets.later },
  ].filter((g) => g.rows.length > 0);
}

function monthKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

/** Groups already-desc-sorted bookings into consecutive per-month buckets, preserving order. */
function groupByMonth(list: BookingRow[]): { key: string; label: string; bookings: BookingRow[] }[] {
  const groups: { key: string; label: string; bookings: BookingRow[] }[] = [];
  for (const b of list) {
    const key = monthKey(b.scheduledAt);
    const last = groups[groups.length - 1];
    if (last?.key === key) {
      last.bookings.push(b);
    } else {
      groups.push({ key, label: monthLabel(b.scheduledAt), bookings: [b] });
    }
  }
  return groups;
}

function BookingCard({
  booking,
  cancellationCutoffHours,
  supportContactId,
  cancelingId,
  onCancel,
}: {
  booking: BookingRow;
  cancellationCutoffHours: number;
  supportContactId: string | null;
  cancelingId: string | null;
  onCancel: (booking: BookingRow) => void;
}) {
  const b = booking;
  const hoursUntil = (new Date(b.scheduledAt).getTime() - Date.now()) / 3_600_000;
  // Self-cancel only exists >=24h out — inside that window there's
  // no button at all (see cancelClassBooking), just a way to
  // reach support for a manual, case-by-case call.
  const cancelEligible = b.status === "SCHEDULED" && hoursUntil >= cancellationCutoffHours;
  const pastSelfServeWindow = b.status === "SCHEDULED" && hoursUntil > 0 && hoursUntil < cancellationCutoffHours;
  return (
    <div className="glass-surface flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm text-slate-100">
          {b.label ?? "Class"} — {formatDateTime(b.scheduledAt)}
        </p>
        <p className="mt-0.5 text-xs text-slate-500">
          {b.creditsSpent} credit{b.creditsSpent === 1 ? "" : "s"}
          {b.status === "SCHEDULED" &&
            (cancelEligible
              ? ` · Cancel by ${new Date(new Date(b.scheduledAt).getTime() - cancellationCutoffHours * 3_600_000).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} for a refund`
              : pastSelfServeWindow
                ? " · Too close to class time to self-cancel"
                : "")}
        </p>
        {b.status === "COMPLETED" && b.attendance && (
          <p className={`mt-0.5 text-xs ${b.attendance === "PRESENT" ? "text-emerald-400" : "text-red-400"}`}>
            {b.attendance === "PRESENT" ? "Attended" : "Marked no-show"}
          </p>
        )}
        {b.status === "CANCELED" && (
          // refunded can still be false on bookings canceled before
          // this policy tightened to "self-cancel is 24h+ only" —
          // kept accurate for that historical data, even though
          // every new cancellation is always refunded now.
          <p className={`mt-0.5 text-xs ${b.refunded ? "text-emerald-400" : "text-red-400"}`}>
            {b.refunded ? "Credits refunded" : "Credits forfeited"}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {cancelEligible && (
          <button
            type="button"
            onClick={() => onCancel(b)}
            disabled={cancelingId === b.id}
            className="rounded-lg border border-red-400/20 px-3 py-1.5 text-xs font-medium text-red-400 transition hover:border-red-400/40 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {cancelingId === b.id ? "Canceling…" : "Cancel"}
          </button>
        )}
        {pastSelfServeWindow && supportContactId && (
          <Link
            href={`/messages?with=${supportContactId}`}
            className="rounded-lg border border-ink/10 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-amber-400/40 hover:text-amber-200"
          >
            Message support
          </Link>
        )}
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide ${STATUS_STYLE[b.status]}`}>
          {STATUS_LABEL[b.status]}
        </span>
      </div>
    </div>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`}
    >
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MonthGroup({
  group,
  defaultOpen,
  cancellationCutoffHours,
  supportContactId,
  cancelingId,
  onCancel,
}: {
  group: { key: string; label: string; bookings: BookingRow[] };
  defaultOpen: boolean;
  cancellationCutoffHours: number;
  supportContactId: string | null;
  cancelingId: string | null;
  onCancel: (booking: BookingRow) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="glass-surface overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-ink/5"
      >
        <span className="text-sm font-medium text-slate-200">{group.label}</span>
        <span className="flex items-center gap-2 text-xs text-slate-500">
          {group.bookings.length} booking{group.bookings.length === 1 ? "" : "s"}
          <ChevronIcon open={open} />
        </span>
      </button>
      {open && (
        <div className="space-y-2 border-t border-ink/10 p-3">
          {group.bookings.map((b) => (
            <BookingCard
              key={b.id}
              booking={b}
              cancellationCutoffHours={cancellationCutoffHours}
              supportContactId={supportContactId}
              cancelingId={cancelingId}
              onCancel={onCancel}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function ClassBookingClient({
  initialCredits,
  cancellationCutoffHours,
  supportContactId,
  occurrences,
  initialBookings,
}: {
  initialCredits: number;
  cancellationCutoffHours: number;
  supportContactId: string | null;
  occurrences: OccurrenceRow[];
  initialBookings: BookingRow[];
}) {
  const [credits, setCredits] = useState(initialCredits);
  const [bookings, setBookings] = useState(initialBookings);
  const [rows, setRows] = useState(occurrences);
  const [bookingKey, setBookingKey] = useState<string | null>(null);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Split into "needs your attention" (still scheduled) vs. an archived,
  // collapsible-by-month history — a flat list of every booking ever made
  // was turning into an endless scroll for anyone with more than a couple
  // months of history.
  const occurrenceGroups = useMemo(() => groupOccurrencesByWeek(rows), [rows]);
  const upcoming = useMemo(() => bookings.filter((b) => b.status === "SCHEDULED"), [bookings]);
  const history = useMemo(() => bookings.filter((b) => b.status !== "SCHEDULED"), [bookings]);
  const historyGroups = useMemo(() => groupByMonth(history), [history]);

  async function handleBook(row: OccurrenceRow) {
    const key = `${row.scheduleId}:${row.occurrenceDateMs}`;
    setError(null);
    setSuccess(null);
    setBookingKey(key);
    const result = await bookClassAction(row.scheduleId, row.occurrenceDateMs);
    setBookingKey(null);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setCredits((c) => c - row.creditCost);
    setRows((prev) =>
      prev.map((r) =>
        r.scheduleId === row.scheduleId && r.occurrenceDateMs === row.occurrenceDateMs
          ? { ...r, seatsBooked: r.seatsBooked + 1, seatsLeft: r.seatsLeft - 1, isFull: r.seatsLeft - 1 <= 0 }
          : r,
      ),
    );
    setBookings((prev) => [
      {
        id: result.id,
        label: row.label,
        scheduledAt: row.scheduledAt,
        creditsSpent: row.creditCost,
        status: "SCHEDULED",
        refunded: false,
        attendance: null,
        canceledReason: null,
      },
      ...prev,
    ]);
    setSuccess("Booked — you're on the roster.");
  }

  async function handleCancel(booking: BookingRow) {
    setError(null);
    setSuccess(null);
    setCancelingId(booking.id);
    const result = await cancelClassBookingAction(booking.id);
    setCancelingId(null);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setBookings((prev) => prev.map((b) => (b.id === booking.id ? { ...b, status: "CANCELED", refunded: true } : b)));
    setCredits((c) => c + booking.creditsSpent);
    setSuccess("Canceled — credits refunded.");
  }

  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-400/80">Weekly Classes</p>
      <h1 className="mt-1.5 font-serif text-2xl text-slate-50">Book a class</h1>
      <p className="mt-2 text-sm text-slate-500">Live on Zoom · 1 credit = 30 minutes · up to 10 students per class.</p>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 glass-surface p-5">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Your balance</p>
          <p className="mt-1 font-serif text-2xl text-slate-50">
            {credits} credit{credits === 1 ? "" : "s"}
          </p>
        </div>
        <Link
          href="/billing/lessons"
          className="rounded-lg border border-ink/10 px-4 py-2 text-xs font-medium text-slate-200 transition hover:border-amber-400/40 hover:text-amber-200"
        >
          Buy credits
        </Link>
      </div>

      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
      {success && <p className="mt-4 text-sm text-emerald-400">{success}</p>}

      <div className="mt-8">
        <h2 className="mb-3 font-serif text-lg text-slate-100">Upcoming classes</h2>
        {rows.length === 0 ? (
          <p className="text-sm text-slate-600">No classes scheduled right now — check back soon.</p>
        ) : (
          /* One card per week with divided rows, rather than a stack of
             separate floating cards: seven identical shadowed pills read as
             seven equally-urgent things. The week heading gives the eye
             somewhere to land, and the Book control is a quiet outline —
             repeating a solid accent fill down the page made the accent
             mean nothing. */
          <div className="space-y-6">
            {occurrenceGroups.map((group) => (
              <section key={group.key}>
                <h3 className="eyebrow mb-2">{group.label}</h3>
                <div className="glass-surface divide-y divide-ink/10 overflow-hidden">
                  {group.rows.map((row) => {
                    const key = `${row.scheduleId}:${row.occurrenceDateMs}`;
                    const insufficientCredits = credits < row.creditCost;
                    const disabled = row.isFull || insufficientCredits || bookingKey !== null;
                    return (
                      <div key={key} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:gap-6">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-slate-100">{formatOccurrenceDay(row.scheduledAt)}</p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {formatOccurrenceTime(row.scheduledAt)} · {formatDuration(row.durationMin)} ·{" "}
                            {row.creditCost} credit{row.creditCost === 1 ? "" : "s"}
                          </p>
                        </div>
                        <p className="shrink-0 text-xs tabular-nums text-slate-500 sm:w-24 sm:text-right">
                          {row.isFull ? (
                            <span className="text-red-400">Full</span>
                          ) : (
                            `${row.seatsLeft} seat${row.seatsLeft === 1 ? "" : "s"} left`
                          )}
                        </p>
                        <button
                          type="button"
                          onClick={() => handleBook(row)}
                          disabled={disabled}
                          className="shrink-0 rounded-lg border border-amber-400/40 px-4 py-2 text-xs font-semibold text-amber-300 transition hover:border-amber-400 hover:bg-amber-400/10 disabled:cursor-not-allowed disabled:border-ink/10 disabled:text-slate-600 disabled:hover:bg-transparent sm:w-36"
                        >
                          {bookingKey === key ? "Booking…" : row.isFull ? "Full" : insufficientCredits ? "Not enough credits" : "Book"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      <div className="mt-8">
        <h2 className="mb-3 font-serif text-lg text-slate-100">Upcoming bookings</h2>
        {upcoming.length === 0 ? (
          <p className="text-sm text-slate-600">No upcoming bookings.</p>
        ) : (
          <div className="space-y-2">
            {upcoming.map((b) => (
              <BookingCard
                key={b.id}
                booking={b}
                cancellationCutoffHours={cancellationCutoffHours}
                supportContactId={supportContactId}
                cancelingId={cancelingId}
                onCancel={handleCancel}
              />
            ))}
          </div>
        )}
      </div>

      <div className="mt-8">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-serif text-lg text-slate-100">History</h2>
          {history.length > 0 && (
            <span className="text-xs text-slate-600">
              {history.length} past booking{history.length === 1 ? "" : "s"}
            </span>
          )}
        </div>
        {historyGroups.length === 0 ? (
          <p className="text-sm text-slate-600">No past bookings yet.</p>
        ) : (
          <div className="space-y-2">
            {historyGroups.map((group, i) => (
              <MonthGroup
                key={group.key}
                group={group}
                defaultOpen={i === 0}
                cancellationCutoffHours={cancellationCutoffHours}
                supportContactId={supportContactId}
                cancelingId={cancelingId}
                onCancel={handleCancel}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
