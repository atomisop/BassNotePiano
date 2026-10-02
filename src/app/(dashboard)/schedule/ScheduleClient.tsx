"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ZellePaymentStatus } from "@prisma/client";
import { formatDateTime, formatEndTime } from "@/lib/classScheduleLabels";
import { Calendar } from "lucide-react";
import { ZelleUnlockGate } from "@/components/billing/ZelleUnlockGate";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { createExtraSessionPaymentAction, submitExtraSessionPaymentAction } from "./actions";
import { getReservableSlotsForChangeAction, changeReservedSlotAction } from "../lessons/actions";
import type { ReservableSlot } from "@/lib/classSchedule";
import { WideLayout } from "@/components/layout/PageLayouts";

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

// "HH:mm" -> "2:00 PM", shown as the raw ET wall-clock digits with no
// per-viewer timezone conversion. Matches AdminScheduleManager.tsx's and
// PaymentPlanEnrollmentFlow.tsx's own formatTimeLabel exactly, kept as its
// own small copy rather than a shared import across the admin/student
// boundary, same "duplicated on purpose" convention this codebase already
// uses elsewhere (e.g. requireAdmin()).
const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
function formatTimeLabel(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

interface WeeklyTime {
  dayOfWeek: number;
  startTime: string;
}

interface ScheduleClientProps {
  zelleHandle: string;
  supportContactId: string | null;
  extraSessionPriceCents: number;
  /** Whether this calendar week already has a class on the books. A
      subscriber never sees a credit count, just whether this week is
      handled or needs attention. */
  hasClassThisWeek: boolean;
  /** The student's own recurring weekly day/time. Null only if a Payment
      Plan was somehow never actually assigned one; see the "not
      scheduled yet" message below, which is exactly the stuck state this
      replaces (a silent, unexplained "0 of 2 credits" with no next step). */
  weeklyTime: WeeklyTime | null;
  upcomingBookings: UpcomingBooking[];
  openSlots: OpenSlot[];
}

export function ScheduleClient({
  zelleHandle,
  supportContactId,
  extraSessionPriceCents,
  hasClassThisWeek,
  weeklyTime,
  upcomingBookings,
  openSlots,
}: ScheduleClientProps) {
  const router = useRouter();
  const [extraPayment, setExtraPayment] = useState<ExtraSessionPayment | null>(null);
  const [pendingSlotKey, setPendingSlotKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Self-service move of the standing weekly reservation — by direct
  // instruction, replacing the previous "that's not self-service, message
  // support" note entirely. Slots are fetched lazily on expand rather than
  // on page load, same reasoning as PaymentPlanEnrollmentFlow's own
  // cadence-driven slot fetch: nobody needs this list until they've said
  // they actually want to change something.
  const [changingTime, setChangingTime] = useState(false);
  const [reservableSlots, setReservableSlots] = useState<ReservableSlot[] | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [changingSlotKey, setChangingSlotKey] = useState<string | null>(null);
  const [changeError, setChangeError] = useState<string | null>(null);
  const [changeSuccess, setChangeSuccess] = useState(false);

  async function openChangeTime() {
    setChangingTime(true);
    setChangeError(null);
    setChangeSuccess(false);
    if (reservableSlots !== null) return; // already loaded once this visit
    setLoadingSlots(true);
    const slots = await getReservableSlotsForChangeAction();
    setLoadingSlots(false);
    setReservableSlots(slots);
  }

  async function handleChangeTime(slot: ReservableSlot) {
    const key = `${slot.scheduleId}:${slot.chunkIndex}`;
    setChangingSlotKey(key);
    setChangeError(null);
    const result = await changeReservedSlotAction(slot.scheduleId, slot.chunkIndex);
    setChangingSlotKey(null);
    if (!result.ok) {
      setChangeError(result.error);
      return;
    }
    setChangeSuccess(true);
    setChangingTime(false);
    setReservableSlots(null); // force a fresh fetch next time — the slot just taken is no longer open
    router.refresh(); // pulls the new weeklyTime/upcomingBookings server props (revalidatePath alone doesn't re-render an already-mounted page)
  }

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
    <WideLayout className="space-y-6">
      <div>
        <p className="text-small font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50)/0.8)]">Weekly Classes</p>
        <h1 className="font-hero text-hero font-bold text-balance mt-1.5 text-slate-50">Your schedule</h1>
        <p className="mt-2 text-small text-slate-400">
          Where your week stands, your upcoming classes, and other open times if you want an extra one.
        </p>
      </div>

      {/* This week */}
      <div className="glass-surface rounded-2xl p-5 sm:p-6">
        <p className="text-small font-medium uppercase tracking-[0.14em] text-slate-400">This week</p>
        {hasClassThisWeek ? (
          <p className="mt-2 text-small text-slate-300">
            <span className="text-[rgb(var(--c-s-50))]">✓ Booked</span>, see it under &ldquo;Your classes&rdquo; below.
          </p>
        ) : weeklyTime ? (
          <p className="mt-2 text-small text-slate-300">
            Your weekly time is <span className="text-slate-100">{DAY_LABELS[weeklyTime.dayOfWeek]}s at {formatTimeLabel(weeklyTime.startTime)}</span>.
            This week&apos;s class is set to appear here automatically. If it hasn&apos;t by the day before,{" "}
            {supportContactId ? (
              <Link href={`/messages?with=${supportContactId}`} className="text-[rgb(var(--c-s-50))] underline hover:opacity-70">
                message support
              </Link>
            ) : (
              "message support"
            )}{" "}
            and we&apos;ll sort it out.
          </p>
        ) : (
          <p className="mt-2 text-small text-slate-300">
            We haven&apos;t set your weekly time yet.{" "}
            {supportContactId ? (
              <Link href={`/messages?with=${supportContactId}`} className="text-[rgb(var(--c-s-50))] underline hover:opacity-70">
                Message support
              </Link>
            ) : (
              "Message support"
            )}{" "}
            and we&apos;ll get you scheduled.
          </p>
        )}
      </div>

      {/* Your classes */}
      <div className="glass-surface rounded-2xl p-5 sm:p-6">
        <p className="text-small font-medium uppercase tracking-[0.14em] text-slate-400">Your classes</p>
        {upcomingBookings.length === 0 ? (
          <p className="mt-3 text-small text-slate-500">Nothing booked yet. Pick a time below to add your first extra session.</p>
        ) : (
          <div className="mt-3 space-y-2.5">
            {upcomingBookings.map((booking) => (
              <div key={booking.id} className="flex items-center justify-between rounded-lg border border-ink/10 px-3.5 py-2.5">
                <div>
                  <p className="text-small font-medium text-slate-100">{formatDateTime(booking.scheduledAt)}</p>
                  <p className="text-small text-slate-500">
                    {booking.label ?? "Weekly class"} · ends {formatEndTime(booking.scheduledAt, booking.creditsSpent)}
                  </p>
                </div>
                <span className="text-small text-slate-500">{booking.creditsSpent * 30} min</span>
              </div>
            ))}
          </div>
        )}

        {/* Self-service move of the standing weekly reservation — by direct
            instruction, replacing the previous message-support-only note.
            Changing your own recurring day/time used to be the one thing a
            Payment Plan subscriber could never do without contacting
            support at all; this is exactly that gap closed, gated the same
            way solo self-reschedule is (a real open slot, no conflicts) via
            changeReservedSlot. */}
        {changeSuccess && (
          <p className="mt-4 rounded-lg border border-emerald-400/20 bg-emerald-400/5 px-3.5 py-2.5 text-small text-emerald-400">
            Your weekly time changed — this week&apos;s class (and the weeks after it) now reflect the new day/time above.
          </p>
        )}

        {changingTime ? (
          <div className="mt-4 rounded-lg border border-ink/10 p-3.5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-small font-medium text-slate-300">Pick a new weekly time</p>
              <button
                type="button"
                onClick={() => setChangingTime(false)}
                className="text-small font-medium text-slate-500 transition hover:text-slate-300"
              >
                Cancel
              </button>
            </div>
            {changeError && <p className="mt-2 text-small text-red-400">{changeError}</p>}
            {loadingSlots ? (
              <p className="mt-3 text-small text-slate-500">Loading open times…</p>
            ) : !reservableSlots || reservableSlots.length === 0 ? (
              <p className="mt-3 text-small text-slate-500">
                Nothing open right now for your cadence.{" "}
                {supportContactId ? (
                  <Link href={`/messages?with=${supportContactId}`} className="text-[rgb(var(--c-s-50))] underline hover:opacity-70">
                    Message support
                  </Link>
                ) : (
                  "Message support"
                )}{" "}
                and we&apos;ll help you find one.
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                {reservableSlots.map((slot) => {
                  const key = `${slot.scheduleId}:${slot.chunkIndex}`;
                  const pending = changingSlotKey === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handleChangeTime(slot)}
                      disabled={changingSlotKey !== null}
                      className="flex w-full items-center gap-2.5 rounded-lg border border-ink/10 px-3.5 py-2.5 text-left text-small text-slate-300 transition hover:border-[rgb(var(--c-s-50)/0.4)] hover:bg-[rgb(var(--c-s-50)/0.06)] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {pending ? (
                        <MorphingSquare size={15} className="shrink-0" />
                      ) : (
                        <Calendar className="h-[15px] w-[15px] shrink-0 text-slate-500" strokeWidth={1.5} />
                      )}
                      <span>
                        {DAY_LABELS[slot.dayOfWeek]}s at {formatTimeLabel(slot.startTime)}
                      </span>
                      <span className="ml-auto text-small font-medium text-[rgb(var(--c-s-50))]">{pending ? "Moving…" : "Choose"}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={openChangeTime}
            className="mt-4 w-full rounded-lg border border-ink/10 bg-slate-900/40 px-3.5 py-2.5 text-left text-small text-slate-400 transition hover:border-[rgb(var(--c-s-50)/0.4)] hover:text-[rgb(var(--c-s-50))]"
          >
            Need a different weekly day or time? Change it yourself →
          </button>
        )}
      </div>

      {/* Extra session */}
      <div className="glass-surface rounded-2xl p-5 sm:p-6">
        <p className="text-small font-medium uppercase tracking-[0.14em] text-slate-400">Want more this week?</p>
        <p className="mt-1.5 text-small text-slate-300">
          Pick an open time below and pay a flat {formatUsd(extraSessionPriceCents)}, that&apos;s the whole purchase. Once
          it&apos;s verified, this exact class is booked for you automatically.
        </p>

        {extraPayment ? (
          <div className="mt-4">
            <p className="mb-3 text-small text-slate-300">{formatDateTime(extraPayment.slot.scheduledAt)}</p>
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
            {error && <p className="mt-3 text-small text-red-400">{error}</p>}
            {openSlots.length === 0 ? (
              <p className="mt-3 text-small text-slate-500">Nothing open right now. Check back soon or message support.</p>
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
                      className="flex w-full items-center gap-2.5 rounded-lg border border-ink/10 px-3.5 py-2.5 text-left text-small text-slate-300 transition hover:border-[rgb(var(--c-s-50)/0.4)] hover:bg-[rgb(var(--c-s-50)/0.06)] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {pending ? (
                        <MorphingSquare size={15} className="shrink-0" />
                      ) : (
                        <Calendar className="h-[15px] w-[15px] shrink-0 text-slate-500" strokeWidth={1.5} />
                      )}
                      <span>{formatDateTime(slot.scheduledAt)}</span>
                      <span className="ml-auto text-small font-medium text-[rgb(var(--c-s-50))]">
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
    </WideLayout>
  );
}
