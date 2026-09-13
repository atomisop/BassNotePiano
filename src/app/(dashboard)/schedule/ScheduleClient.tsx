"use client";

import { useState } from "react";
import Link from "next/link";
import type { ZellePaymentStatus } from "@prisma/client";
import { formatDateTime, formatEndTime } from "@/lib/classScheduleLabels";
import { Calendar } from "lucide-react";
import { ZelleUnlockGate } from "@/components/billing/ZelleUnlockGate";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { createExtraSessionPaymentAction, submitExtraSessionPaymentAction } from "./actions";

function formatUsd(cents: number) {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

interface UpcomingBooking {
  id: string;
  label: string | null;
  scheduledAt: string;
  creditsSpent: number;
}

interface OpenSlot {
  scheduleId: string;
  chunkIndex: number;
  label: string | null;
  scheduledAt: string;
  creditCost: number;
}

interface ExtraSessionPayment {
  id: string;
  status: ZellePaymentStatus;
  rejectionReason: string | null;
  amountCents: number;
}

interface ScheduleClientProps {
  zelleHandle: string;
  credits: number;
  creditsUsedThisWeek: number;
  /** Null when the student has no ACTIVE Payment Plan right now. */
  weeklyAllotment: number | null;
  supportContactId: string | null;
  extraSessionPriceCents: number;
  upcomingBookings: UpcomingBooking[];
  openSlots: OpenSlot[];
}

export function ScheduleClient({
  zelleHandle,
  credits,
  creditsUsedThisWeek,
  weeklyAllotment,
  supportContactId,
  extraSessionPriceCents,
  upcomingBookings,
  openSlots,
}: ScheduleClientProps) {
  const [extraPayment, setExtraPayment] = useState<ExtraSessionPayment | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const weekProgressPercent =
    weeklyAllotment && weeklyAllotment > 0 ? Math.min(100, (creditsUsedThisWeek / weeklyAllotment) * 100) : null;

  async function handleBuyExtraSession() {
    setLoading(true);
    setError(null);
    const result = await createExtraSessionPaymentAction();
    setLoading(false);
    if (!result.ok || !result.id || !result.status || result.amountCents === null) {
      setError(result.error ?? "Something went wrong starting that purchase. Please try again.");
      return;
    }
    setExtraPayment({ id: result.id, status: result.status as ZellePaymentStatus, rejectionReason: null, amountCents: result.amountCents });
  }

  return (
    <div className="w-full max-w-3xl space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50)/0.8)]">Weekly Classes</p>
        <h1 className="mt-1.5 font-serif text-3xl text-slate-50">Your schedule</h1>
        <p className="mt-2 text-sm text-slate-400">
          Where your week stands, your upcoming classes, and other open times if you want an extra one.
        </p>
      </div>

      {/* This week */}
      <div className="glass-surface rounded-2xl p-5 sm:p-6">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">This week</p>
        <div className="mt-3 flex items-end justify-between">
          <p className="font-serif text-3xl text-slate-50">
            {creditsUsedThisWeek}
            {weeklyAllotment !== null && <span className="text-lg text-slate-500"> / {weeklyAllotment} credits</span>}
          </p>
          <p className="text-sm text-slate-400">{credits} credit{credits === 1 ? "" : "s"} available overall</p>
        </div>
        {weekProgressPercent !== null && (
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
            <div className="h-full rounded-full bg-[rgb(var(--c-s-50))]" style={{ width: `${weekProgressPercent}%` }} />
          </div>
        )}
        {weeklyAllotment === null && (
          <p className="mt-2 text-xs text-slate-500">
            No active Payment Plan right now, so there&apos;s no fixed weekly amount to compare against, just your overall balance.
          </p>
        )}
      </div>

      {/* Your classes */}
      <div className="glass-surface rounded-2xl p-5 sm:p-6">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Your classes</p>
        {upcomingBookings.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">
            Nothing booked yet. <Link href="/lessons" className="text-[rgb(var(--c-s-50))] underline hover:opacity-70">Book a class</Link>.
          </p>
        ) : (
          <div className="mt-3 space-y-2.5">
            {upcomingBookings.map((booking) => (
              <div key={booking.id} className="flex items-center justify-between rounded-lg border border-ink/10 px-3.5 py-2.5">
                <div>
                  <p className="text-sm font-medium text-slate-100">{formatDateTime(booking.scheduledAt)}</p>
                  <p className="text-xs text-slate-500">
                    {booking.label ?? "Weekly class"} · ends {formatEndTime(booking.scheduledAt, booking.creditsSpent)}
                  </p>
                </div>
                <span className="text-xs text-slate-500">
                  {booking.creditsSpent} credit{booking.creditsSpent === 1 ? "" : "s"}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Never a self-service reschedule action here, by direct
            instruction: a Payment Plan's reserved weekly day/time is locked
            in at enrollment and nothing in this app lets a student move it
            themselves afterward. This note is what replaces that button,
            not a placeholder for one. */}
        <p className="mt-4 rounded-lg border border-ink/10 bg-slate-900/40 px-3.5 py-2.5 text-xs text-slate-500">
          Need a different weekly day or time? That&apos;s not self-service.{" "}
          {supportContactId ? (
            <Link href={`/messages?with=${supportContactId}`} className="text-[rgb(var(--c-s-50))] underline hover:opacity-70">
              Message support
            </Link>
          ) : (
            "Message support"
          )}{" "}
          and we&apos;ll help with a change for that week.
        </p>
      </div>

      {/* Extra session */}
      <div className="glass-surface rounded-2xl p-5 sm:p-6">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Want more this week?</p>
        <p className="mt-1.5 text-sm text-slate-300">
          A flat {formatUsd(extraSessionPriceCents)} adds one extra class credit on top of whatever your plan already covers,
          no new commitment. Here are some open times coming up:
        </p>

        {openSlots.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">Nothing open right now. Check back soon or message support.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {openSlots.map((slot) => (
              <div
                key={`${slot.scheduleId}:${slot.chunkIndex}:${slot.scheduledAt}`}
                className="flex items-center gap-2.5 rounded-lg border border-ink/10 px-3.5 py-2 text-sm text-slate-300"
              >
                <Calendar className="h-[15px] w-[15px] shrink-0 text-slate-500" strokeWidth={1.5} />
                <span>{formatDateTime(slot.scheduledAt)}</span>
                <span className="ml-auto text-xs text-slate-500">{slot.creditCost} credit{slot.creditCost === 1 ? "" : "s"}</span>
              </div>
            ))}
          </div>
        )}

        {extraPayment ? (
          <div className="mt-4">
            <ZelleUnlockGate
              status={extraPayment.status}
              rejectionReason={extraPayment.rejectionReason}
              scaleCode="Extra session"
              scaleTitle="1 extra class credit"
              eyebrowLabel="Schedule"
              amountCents={extraPayment.amountCents}
              zelleHandle={zelleHandle}
              onSubmitPayment={submitExtraSessionPaymentAction.bind(null, extraPayment.id)}
            />
          </div>
        ) : (
          <>
            {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
            <button
              type="button"
              onClick={handleBuyExtraSession}
              disabled={loading}
              className="cta-sheen cta-fill mt-4 flex w-full items-center justify-center rounded-xl py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:px-6"
            >
              {loading && <MorphingSquare size={14} className="mr-2 shrink-0" />}
              {loading ? "Loading…" : `Buy 1 extra credit · ${formatUsd(extraSessionPriceCents)}`}
            </button>
          </>
        )}

        <p className="mt-3 text-xs text-slate-500">
          Once verified, the credit lands on your balance above. Book any open time from{" "}
          <Link href="/lessons" className="text-[rgb(var(--c-s-50))] underline hover:opacity-70">
            the Lessons page
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
