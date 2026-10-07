"use client";

import { CLASS_MINUTES, CREDITS_PER_CLASS } from "@/lib/classCreditPricing";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatDateTime, formatEndTime } from "@/lib/classScheduleLabels";
import { Calendar } from "lucide-react";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { getReservableSlotsForChangeAction, changeReservedSlotAction, cancelClassBookingAction } from "../lessons/actions";
import type { ReservableSlot } from "@/lib/classSchedule";
import { WideLayout } from "@/components/layout/PageLayouts";
import { DISCORD_INVITE_URL } from "@/lib/discord";
import { MessageSupportButton } from "@/components/lessons/MessageSupportButton";
import { errorNeedsTeam } from "@/lib/bookingRules";

interface UpcomingBooking {
  id: string;
  label: string | null;
  scheduledAt: string;
  creditsSpent: number;
  /** The private Discord call for this class, once it exists. */
  discordUrl?: string | null;
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
  supportContactId: string | null;
  /** Hours before class that changing or cancelling stops being self-service. */
  cancellationCutoffHours: number;
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
}

export function ScheduleClient({
  supportContactId,
  cancellationCutoffHours,
  hasClassThisWeek,
  weeklyTime,
  upcomingBookings,
}: ScheduleClientProps) {
  const router = useRouter();
  // Skipping one class (24+ hours ahead): two taps, then it is gone and its
  // credit stays on the account, to use on a different time under Extra sessions.
  const [confirmSkipId, setConfirmSkipId] = useState<string | null>(null);
  const [skippingId, setSkippingId] = useState<string | null>(null);
  const [skipError, setSkipError] = useState<string | null>(null);

  async function handleSkip(bookingId: string) {
    setSkippingId(bookingId);
    setSkipError(null);
    const result = await cancelClassBookingAction(bookingId);
    setSkippingId(null);
    if (!result.ok) {
      setSkipError(result.error);
      return;
    }
    setConfirmSkipId(null);
    router.refresh();
  }

  // Self-service move of the standing weekly reservation, by direct
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
    setReservableSlots(null); // force a fresh fetch next time, the slot just taken is no longer open
    router.refresh(); // pulls the new weeklyTime/upcomingBookings server props (revalidatePath alone doesn't re-render an already-mounted page)
  }

  return (
    <WideLayout className="space-y-6">
      <div>
        <p className="text-small font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50)/0.8)]">Weekly Classes</p>
        <h1 className="font-hero text-hero font-bold text-balance mt-1.5 text-slate-50">Your schedule</h1>
      </div>

      {/* This week */}
      <div className="glass-surface rounded-2xl p-5 sm:p-6">
        <p className="text-small font-medium uppercase tracking-[0.14em] text-slate-400">This week</p>
        {hasClassThisWeek ? (
          <p className="mt-2 text-small text-slate-300">
            <span className="text-[rgb(var(--c-s-50))]">✓ Booked</span>
          </p>
        ) : weeklyTime ? (
          <p className="mt-2 text-small text-slate-300">
            Your weekly time is <span className="text-slate-100">{DAY_LABELS[weeklyTime.dayOfWeek]}s at {formatTimeLabel(weeklyTime.startTime)}</span>.
          </p>
        ) : (
          <p className="mt-2 text-small text-slate-300">
            No weekly time set.{" "}
            {supportContactId ? (
              <Link href={`/messages?with=${supportContactId}`} className="text-[rgb(var(--c-s-50))] underline hover:opacity-70">
                Message support
              </Link>
            ) : (
              "Message support"
            )}
          </p>
        )}
      </div>

      {/* Your classes */}
      <div className="glass-surface rounded-2xl p-5 sm:p-6">
        <p className="text-small font-medium uppercase tracking-[0.14em] text-slate-400">Your classes</p>
        {upcomingBookings.length === 0 ? (
          <p className="mt-3 text-small text-slate-500">Nothing booked yet.</p>
        ) : (
          <div className="mt-3 space-y-2.5">
            {upcomingBookings.map((booking) => {
              const hoursUntil = (new Date(booking.scheduledAt).getTime() - Date.now()) / 3_600_000;
              const canChange = hoursUntil >= cancellationCutoffHours;
              const confirming = confirmSkipId === booking.id;
              const busy = skippingId === booking.id;
              return (
                <div key={booking.id} className="rounded-lg bg-neu-base px-3.5 py-2.5 shadow-raised-low">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-small font-medium text-slate-100">{formatDateTime(booking.scheduledAt)}</p>
                      <p className="text-small text-slate-500">
                        {booking.label ?? "Weekly class"} · ends {formatEndTime(booking.scheduledAt, booking.creditsSpent)}
                      </p>
                    </div>
                    <span className="shrink-0 text-small text-slate-500">{Math.round((booking.creditsSpent / CREDITS_PER_CLASS) * CLASS_MINUTES)} min</span>
                  </div>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {hoursUntil <= 0.5 && hoursUntil > -1 && (
                      <a
                        href={booking.discordUrl ?? DISCORD_INVITE_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="tap cta-sheen cta-fill inline-flex items-center rounded-lg px-3 py-1.5 text-small font-semibold"
                      >
                        Join on Discord
                      </a>
                    )}
                    {hoursUntil > 0 && (
                      <a
                        href={`/api/calendar/class?s=${encodeURIComponent(booking.scheduledAt)}&m=${Math.round((booking.creditsSpent / CREDITS_PER_CLASS) * CLASS_MINUTES)}`}
                        className="tap neu-btn inline-flex items-center rounded-lg px-3 py-1.5 text-small font-medium"
                      >
                        Add to calendar
                      </a>
                    )}
                  </div>
                  {canChange ? (
                    confirming ? (
                      <div className="mt-2.5 rounded-lg bg-neu-base px-3 py-2.5 shadow-pressed-low">
                        <p className="text-small text-slate-300">
                          Skip this class? It stays on your account.
                        </p>
                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            onClick={() => setConfirmSkipId(null)}
                            disabled={busy}
                            className="tap rounded-lg px-3 py-2 text-small font-medium text-slate-300 bg-neu-base shadow-raised-low active:shadow-pressed-low disabled:opacity-50"
                          >
                            Keep it
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSkip(booking.id)}
                            disabled={busy}
                            className="tap flex items-center gap-1.5 rounded-lg bg-red-500 px-3 py-2 text-small font-semibold text-white shadow-raised-low hover:bg-red-400 disabled:opacity-50"
                          >
                            {busy && <MorphingSquare size={12} />}
                            {busy ? "Skipping…" : "Skip this class"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Link href={`/lessons?tab=extra&move=${booking.id}`} className="tap neu-btn inline-flex items-center rounded-lg px-3 py-1.5 text-small font-medium">
                          Move this week
                        </Link>
                        <button
                          type="button"
                          onClick={() => {
                            setSkipError(null);
                            setConfirmSkipId(booking.id);
                          }}
                          className="tap neu-btn rounded-lg px-3 py-1.5 text-small"
                        >
                          Skip this class
                        </button>
                      </div>
                    )
                  ) : (
                    <p className="mt-2 text-small text-slate-500">
                      Starts within {cancellationCutoffHours} hours, so changes now go through the team.
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <MessageSupportButton bookingId={booking.id} />
                  </div>
                </div>
              );
            })}
            {skipError && (
              <div className="flex flex-wrap items-center gap-3" role="alert">
                <p className="text-small text-red-400">{skipError}</p>
                {errorNeedsTeam(skipError) && <MessageSupportButton problem={skipError} label="Message support about this" />}
              </div>
            )}
          </div>
        )}

        {/* Self-service move of the standing weekly reservation, by direct
            instruction, replacing the previous message-support-only note.
            Changing your own recurring day/time used to be the one thing a
            Payment Plan subscriber could never do without contacting
            support at all; this is exactly that gap closed, gated the same
            way solo self-reschedule is (a real open slot, no conflicts) via
            changeReservedSlot. */}
        {changeSuccess && (
          <p className="mt-4 rounded-lg bg-slate-50/5 px-3.5 py-2.5 text-small text-slate-50 bg-neu-base shadow-raised-low">
            Your weekly time changed.
          </p>
        )}

        {changingTime ? (
          <div className="mt-4 rounded-lg p-3.5 bg-neu-base shadow-raised-low">
            <div className="flex items-center justify-between gap-3">
              <p className="text-small font-medium text-slate-300">Pick a new weekly time</p>
              <button
                type="button"
                onClick={() => setChangingTime(false)}
                className="tap neu-btn rounded-lg px-3 py-1.5 text-small"
              >
                Cancel
              </button>
            </div>
            {changeError && <p className="mt-2 text-small text-red-400">{changeError}</p>}
            {loadingSlots ? (
              <p className="mt-3 text-small text-slate-500">Loading open times…</p>
            ) : !reservableSlots || reservableSlots.length === 0 ? (
              <p className="mt-3 text-small text-slate-500">
                Nothing open right now.
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
                      className="flex w-full items-center gap-2.5 rounded-lg px-3.5 py-2.5 text-left text-small text-slate-300 transition hover:bg-[rgb(var(--c-s-50)/0.06)] disabled:cursor-not-allowed disabled:opacity-60 bg-neu-base shadow-raised-low hover:shadow-raised-mid active:shadow-pressed-low"
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
            className="mt-4 w-full rounded-lg px-3.5 py-2.5 text-left text-small text-slate-400 transition hover:text-[rgb(var(--c-s-50))] bg-neu-base shadow-raised-low hover:shadow-raised-mid active:shadow-pressed-low"
          >
            Change weekly time →
          </button>
        )}
      </div>

    </WideLayout>
  );
}
