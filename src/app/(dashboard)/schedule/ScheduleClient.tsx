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
  occurrenceDateMs: number;
  chunkIndex: number;
  label: string | null;
  scheduledAt: string;
}

function slotKey(slot: OpenSlot) {
  return `${slot.scheduleId}:${slot.occurrenceDateMs}:${slot.chunkIndex}`;
}

interface ExtraSessionPayment {
  id: string;
  status: ZellePaymentStatus;
  rejectionReason: string | null;
  amountCents: number;
  slot: OpenSlot;
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
  const [pendingSlotKey, setPendingSlotKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const weekProgressPercent =
    weeklyAllotment && weeklyAllotment > 0 ? Math.min(100, (creditsUsedThisWeek / weeklyAllotment) * 100) : null;

  // One click picks the time and starts the purchase in the same motion,
  // no separate "select a slot, then confirm" step, by direct instruction:
  // buying should be exactly as easy as picking the time you want.
  // scheduledAt itself is display-only (formatDateTime below), never sent:
  // the server recomputes the real instant from scheduleId + occurrenceDate
  // + chunkIndex on its own, the same way bookClass never trusts a raw
  // scheduledAt from the client either.
  async function handleBuySlot(slot: OpenSlot) {
    setPendingSlotKey(slotKey(slot));
    setError(null);
    const result = await createExtraSessionPaymentAction({
      scheduleId: slot.scheduleId,
      occurrenceDateMs: slot.occurrenceDateMs,
      chunkIndex: slot.chunkIndex,
    });
    setPendingSlotKey(null);
    if (!result.ok || !result.id || !result.status || result.amountCents === null) {
      setError(result.error ?? "Something went wrong starting that purchase. Please try again.");
      return;
    }
    setExtraPayment({ id: result.id, status: result.status as ZellePaymentStatus, rejectionReason: null, amountCents: result.amountCents, slot });
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
          <p className="mt-3 text-sm text-slate-500">Nothing booked yet. Pick a time below to add your first extra session.</p>
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
          Pick an open time below and pay a flat {formatUsd(extraSessionPriceCents)}, that&apos;s the whole purchase. Once
          it&apos;s verified, this exact class is booked for you automatically.
        </p>

        {extraPayment ? (
          <div className="mt-4">
            <p className="mb-3 text-sm text-slate-300">{formatDateTime(extraPayment.slot.scheduledAt)}</p>
            <ZelleUnlockGate
              status={extraPayment.status}
              rejectionReason={extraPayment.rejectionReason}
              scaleCode="Extra session"
              scaleTitle={extraPayment.slot.label ?? "Extra class"}
              eyebrowLabel="Schedule"
              amountCents={extraPayment.amountCents}
              zelleHandle={zelleHandle}
              onSubmitPayment={submitExtraSessionPaymentAction.bind(null, extraPayment.id)}
            />
          </div>
        ) : (
          <>
            {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
            {openSlots.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">Nothing open right now. Check back soon or message support.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {openSlots.map((slot) => {
                  const pending = pendingSlotKey === slotKey(slot);
                  return (
                    <button
                      key={slotKey(slot)}
                      type="button"
                      onClick={() => handleBuySlot(slot)}
                      disabled={pendingSlotKey !== null}
                      className="flex w-full items-center gap-2.5 rounded-lg border border-ink/10 px-3.5 py-2.5 text-left text-sm text-slate-300 transition hover:border-[rgb(var(--c-s-50)/0.4)] hover:bg-[rgb(var(--c-s-50)/0.06)] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {pending ? (
                        <MorphingSquare size={15} className="shrink-0" />
                      ) : (
                        <Calendar className="h-[15px] w-[15px] shrink-0 text-slate-500" strokeWidth={1.5} />
                      )}
                      <span>{formatDateTime(slot.scheduledAt)}</span>
                      <span className="ml-auto text-xs font-medium text-[rgb(var(--c-s-50))]">
                        {pending ? "Starting…" : formatUsd(extraSessionPriceCents)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
