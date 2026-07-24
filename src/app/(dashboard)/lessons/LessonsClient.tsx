"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import type { LessonType } from "@prisma/client";
import { bookLessonAction } from "./actions";

interface Credits {
  online: number;
  inPerson: number;
}

interface BookingRow {
  id: string;
  type: LessonType;
  scheduledAt: string;
  status: "SCHEDULED" | "COMPLETED" | "CANCELED";
  notes: string | null;
  canceledReason: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  SCHEDULED: "Scheduled",
  COMPLETED: "Completed",
  CANCELED: "Canceled",
};

const STATUS_STYLE: Record<string, string> = {
  SCHEDULED: "bg-amber-400/15 text-amber-300",
  COMPLETED: "bg-emerald-400/15 text-emerald-300",
  CANCELED: "bg-slate-800 text-slate-500",
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function LessonsClient({
  initialCredits,
  initialBookings,
}: {
  initialCredits: Credits;
  initialBookings: BookingRow[];
}) {
  const [credits, setCredits] = useState(initialCredits);
  const [bookings, setBookings] = useState(initialBookings);
  const [type, setType] = useState<LessonType>(initialCredits.online > 0 ? "ONLINE" : "IN_PERSON");
  const [scheduledAt, setScheduledAt] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const hasAnyCredits = credits.online > 0 || credits.inPerson > 0;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!scheduledAt) return;
    setSubmitting(true);
    setError(null);
    setSuccess(false);

    const iso = new Date(scheduledAt).toISOString();
    const result = await bookLessonAction(type, iso, notes);
    setSubmitting(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setSuccess(true);
    setBookings((prev) => [
      { id: result.id, type, scheduledAt: iso, status: "SCHEDULED", notes: notes.trim() || null, canceledReason: null },
      ...prev,
    ]);
    setCredits((prev) =>
      type === "ONLINE" ? { ...prev, online: prev.online - 1 } : { ...prev, inPerson: prev.inPerson - 1 },
    );
    setScheduledAt("");
    setNotes("");
  }

  return (
    <div className="mx-auto max-w-2xl">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-400/80">Live Lessons</p>
      <h1 className="mt-1.5 font-serif text-2xl text-slate-50">Book a lesson</h1>
      <p className="mt-2 text-sm text-slate-500">$50 per 30-minute session — Online or In-Person.</p>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <div className="glass-card p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Online credits</p>
          <p className="mt-1 font-serif text-2xl text-slate-50">{credits.online}</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">In-person credits</p>
          <p className="mt-1 font-serif text-2xl text-slate-50">{credits.inPerson}</p>
        </div>
      </div>

      {!hasAnyCredits ? (
        <div className="mt-6 glass-card p-8 text-center">
          <p className="text-sm text-slate-400">You don't have any lesson credits yet.</p>
          <Link
            href="/billing/lessons"
            className="mt-4 inline-block rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-amber-300"
          >
            Buy lesson credits
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-6 glass-card space-y-4 p-6">
          <div>
            <p className="mb-1.5 text-xs font-medium text-slate-400">Lesson type</p>
            <div className="flex gap-2">
              {credits.online > 0 && (
                <button
                  type="button"
                  onClick={() => setType("ONLINE")}
                  className={`flex-1 rounded-lg border px-3 py-2.5 text-sm font-medium transition ${
                    type === "ONLINE"
                      ? "border-amber-400/60 bg-amber-400/10 text-amber-200"
                      : "border-white/10 text-slate-400 hover:border-white/20"
                  }`}
                >
                  Online ({credits.online} left)
                </button>
              )}
              {credits.inPerson > 0 && (
                <button
                  type="button"
                  onClick={() => setType("IN_PERSON")}
                  className={`flex-1 rounded-lg border px-3 py-2.5 text-sm font-medium transition ${
                    type === "IN_PERSON"
                      ? "border-amber-400/60 bg-amber-400/10 text-amber-200"
                      : "border-white/10 text-slate-400 hover:border-white/20"
                  }`}
                >
                  In-Person ({credits.inPerson} left)
                </button>
              )}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">Preferred date & time</label>
            <input
              type="datetime-local"
              required
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-amber-400/60"
            />
            <p className="mt-1 text-xs text-slate-600">
              This is a request, not a confirmed slot — we'll follow up to lock in the time.
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Anything we should know?"
              className="w-full resize-none rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-amber-400/60"
            />
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}
          {success && <p className="text-xs text-emerald-400">Requested — we'll be in touch to confirm.</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-amber-400 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Requesting…" : "Request lesson"}
          </button>
        </form>
      )}

      <div className="mt-8">
        <h2 className="mb-3 font-serif text-lg text-slate-100">Your bookings</h2>
        {bookings.length === 0 ? (
          <p className="text-sm text-slate-600">No bookings yet.</p>
        ) : (
          <div className="space-y-2">
            {bookings.map((b) => (
              <div key={b.id} className="glass-card flex items-center justify-between gap-3 p-4">
                <div>
                  <p className="text-sm text-slate-100">
                    {b.type === "ONLINE" ? "Online" : "In-Person"} — {formatDateTime(b.scheduledAt)}
                  </p>
                  {b.notes && <p className="mt-0.5 text-xs text-slate-500">{b.notes}</p>}
                  {b.status === "CANCELED" && b.canceledReason && (
                    <p className="mt-0.5 text-xs text-red-400">Canceled: {b.canceledReason}</p>
                  )}
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide ${STATUS_STYLE[b.status]}`}
                >
                  {STATUS_LABEL[b.status]}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
