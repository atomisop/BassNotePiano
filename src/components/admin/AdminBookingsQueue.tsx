"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminLessonBooking } from "@/lib/lessons";
import { SuccessGlowPulse } from "@/components/ui/SuccessGlowPulse";

export interface AdminBookingsQueueProps {
  bookings: AdminLessonBooking[];
  onComplete: (bookingId: string) => Promise<void>;
  onCancel: (bookingId: string, reason: string) => Promise<void>;
  emptyMessage?: string;
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

function formatDateTime(date: Date) {
  return new Date(date).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function Avatar({ image, name }: { image: string | null | undefined; name: string }) {
  return (
    <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-white/10 bg-slate-800">
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center font-serif text-sm text-amber-300">
          {name.charAt(0).toUpperCase()}
        </div>
      )}
    </div>
  );
}

export function AdminBookingsQueue({
  bookings,
  onComplete,
  onCancel,
  emptyMessage = "No bookings.",
}: AdminBookingsQueueProps) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [justCompletedId, setJustCompletedId] = useState<string | null>(null);

  async function handleComplete(id: string) {
    setBusyId(id);
    try {
      await onComplete(id);
      setJustCompletedId(id);
      router.refresh();
      window.setTimeout(() => setJustCompletedId(null), 1400);
    } finally {
      setBusyId(null);
    }
  }

  async function handleCancel(id: string) {
    setBusyId(id);
    try {
      await onCancel(id, reason.trim());
      router.refresh();
      setCancelingId(null);
      setReason("");
    } finally {
      setBusyId(null);
    }
  }

  if (bookings.length === 0) {
    return <div className="glass-surface backdrop-blur-2xl p-8 text-center text-sm text-slate-500">{emptyMessage}</div>;
  }

  return (
    <div className="space-y-3">
      {bookings.map((booking) => (
        <div key={booking.id} className="glass-surface relative backdrop-blur-2xl p-5">
          {justCompletedId === booking.id && <SuccessGlowPulse />}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <Avatar image={booking.student.image} name={booking.student.name ?? booking.student.username ?? "?"} />
              <div>
                <h3 className="font-serif text-lg text-slate-50">
                  {booking.student.name ?? booking.student.username ?? "Student"}
                </h3>
                <p className="mt-0.5 text-sm text-slate-500">
                  {booking.type === "ONLINE" ? "Online" : "In-Person"} · {formatDateTime(booking.scheduledAt)}
                </p>
                <p className="mt-0.5 text-xs text-slate-600">{booking.student.email}</p>
              </div>
            </div>
            <span
              className={`inline-block rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide ${STATUS_STYLE[booking.status]}`}
            >
              {STATUS_LABEL[booking.status]}
            </span>
          </div>

          {booking.notes && <p className="mt-3 text-sm text-slate-500">Note: {booking.notes}</p>}
          {booking.status === "CANCELED" && booking.canceledReason && (
            <p className="mt-2 text-sm text-red-400">Canceled: {booking.canceledReason}</p>
          )}

          {booking.status === "SCHEDULED" &&
            (cancelingId === booking.id ? (
              <div className="mt-4 space-y-2">
                <textarea
                  autoFocus
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Why is this being canceled? (optional)"
                  rows={2}
                  className="w-full resize-none rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-red-400/60"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setCancelingId(null);
                      setReason("");
                    }}
                    disabled={busyId === booking.id}
                    className="flex-1 rounded-lg border border-white/10 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-800 disabled:opacity-50"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCancel(booking.id)}
                    disabled={busyId === booking.id}
                    className="flex-1 rounded-lg bg-red-500/90 py-2 text-sm font-semibold text-slate-950 transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busyId === booking.id ? "Canceling…" : "Confirm cancel"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => setCancelingId(booking.id)}
                  disabled={busyId === booking.id}
                  className="flex-1 rounded-lg border border-white/10 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-800 disabled:opacity-50"
                >
                  Cancel (refund credit)
                </button>
                <button
                  type="button"
                  onClick={() => handleComplete(booking.id)}
                  disabled={busyId === booking.id}
                  className="cta-sheen flex-1 rounded-lg bg-amber-400 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busyId === booking.id ? "Saving…" : "Mark completed"}
                </button>
              </div>
            ))}
        </div>
      ))}
    </div>
  );
}
