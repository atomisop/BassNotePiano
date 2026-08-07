"use client";

import { useState } from "react";
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

export function ClassBookingClient({
  initialCredits,
  cancellationCutoffHours,
  occurrences,
  initialBookings,
}: {
  initialCredits: number;
  cancellationCutoffHours: number;
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

    setBookings((prev) =>
      prev.map((b) => (b.id === booking.id ? { ...b, status: "CANCELED", refunded: result.refunded } : b)),
    );
    if (result.refunded) setCredits((c) => c + booking.creditsSpent);
    setSuccess(result.refunded ? "Canceled — credits refunded." : "Canceled — credits were forfeited (inside the cutoff).");
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
          className="rounded-lg border border-white/15 px-4 py-2 text-xs font-medium text-slate-200 transition hover:border-amber-400/40 hover:text-amber-200"
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
          <div className="space-y-2">
            {rows.map((row) => {
              const key = `${row.scheduleId}:${row.occurrenceDateMs}`;
              const insufficientCredits = credits < row.creditCost;
              const disabled = row.isFull || insufficientCredits || bookingKey !== null;
              return (
                <div key={key} className="glass-surface flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm text-slate-100">
                      {row.label ?? "Class"} — {formatDateTime(row.scheduledAt)}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {formatDuration(row.durationMin)} · {row.creditCost} credit{row.creditCost === 1 ? "" : "s"} ·{" "}
                      {row.isFull ? (
                        <span className="text-red-400">Full</span>
                      ) : (
                        `${row.seatsLeft} seat${row.seatsLeft === 1 ? "" : "s"} left`
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleBook(row)}
                    disabled={disabled}
                    className="cta-sheen shrink-0 rounded-lg bg-amber-400 px-4 py-2 text-xs font-semibold text-slate-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {bookingKey === key ? "Booking…" : row.isFull ? "Full" : insufficientCredits ? "Not enough credits" : "Book"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-8">
        <h2 className="mb-3 font-serif text-lg text-slate-100">Your bookings</h2>
        {bookings.length === 0 ? (
          <p className="text-sm text-slate-600">No bookings yet.</p>
        ) : (
          <div className="space-y-2">
            {bookings.map((b) => {
              const hoursUntil = (new Date(b.scheduledAt).getTime() - Date.now()) / 3_600_000;
              const cancelEligible = b.status === "SCHEDULED" && hoursUntil >= cancellationCutoffHours;
              const stillCancelable = b.status === "SCHEDULED" && hoursUntil > 0;
              return (
                <div key={b.id} className="glass-surface flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm text-slate-100">
                      {b.label ?? "Class"} — {formatDateTime(b.scheduledAt)}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {b.creditsSpent} credit{b.creditsSpent === 1 ? "" : "s"}
                      {b.status === "SCHEDULED" &&
                        (cancelEligible
                          ? ` · Cancel by ${new Date(new Date(b.scheduledAt).getTime() - cancellationCutoffHours * 3_600_000).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} for a refund`
                          : stillCancelable
                            ? " · Canceling now forfeits your credits"
                            : "")}
                    </p>
                    {b.status === "COMPLETED" && b.attendance && (
                      <p className={`mt-0.5 text-xs ${b.attendance === "PRESENT" ? "text-emerald-400" : "text-red-400"}`}>
                        {b.attendance === "PRESENT" ? "Attended" : "Marked no-show"}
                      </p>
                    )}
                    {b.status === "CANCELED" && (
                      <p className={`mt-0.5 text-xs ${b.refunded ? "text-emerald-400" : "text-red-400"}`}>
                        {b.refunded ? "Credits refunded" : "Credits forfeited"}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {stillCancelable && (
                      <button
                        type="button"
                        onClick={() => handleCancel(b)}
                        disabled={cancelingId === b.id}
                        className="rounded-lg border border-red-400/20 px-3 py-1.5 text-xs font-medium text-red-400 transition hover:border-red-400/40 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {cancelingId === b.id ? "Canceling…" : "Cancel"}
                      </button>
                    )}
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide ${STATUS_STYLE[b.status]}`}
                    >
                      {STATUS_LABEL[b.status]}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
