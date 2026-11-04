"use client";

import { OpenSupportLink } from "@/components/notifications/OpenSupportLink";
import { CLASS_MINUTES, CREDITS_PER_CLASS } from "@/lib/classCreditPricing";
import { PulsatingDots } from "@/components/ui/pulsating-loader";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatDateTime, formatEndTime } from "@/lib/classScheduleLabels";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { getReservableSlotsForChangeAction, changeReservedSlotAction, cancelClassBookingAction } from "./actions";
import type { ReservableSlot } from "@/lib/classSchedule";
import { WideLayout } from "@/components/layout/PageLayouts";
import { DISCORD_INVITE_URL } from "@/lib/discord";
import { WeeklyTimePicker } from "./WeeklyTimePicker";
import { MessageSupportButton } from "@/components/lessons/MessageSupportButton";
import { errorNeedsTeam } from "@/lib/bookingRules";
import { buttonVariants } from "@/components/ui/button";
import { DiscordLink } from "@/components/ui/DiscordLink";
import { announceChange } from "@/lib/liveEvents";
import { toast } from "@/components/ui/Toaster";

interface UpcomingBooking {
  id: string;
  label: string | null;
  scheduledAt: string;
  creditsSpent: number;
  /** The private Discord call for this class, once it exists. */
  discordUrl?: string | null;
  /** Taught in person: there is no Discord call. */
  inPerson?: boolean;
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
  /** Hours before class that changing or cancelling stops being self-service. */
  cancellationCutoffHours: number;
  /** The owner can switch self-cancel and self-reschedule off (Settings → Cancel and reschedule). */
  canCancel: boolean;
  canReschedule: boolean;
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
  cancellationCutoffHours,
  canCancel,
  canReschedule,
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
    const hold = await toast.held("Skipping this class", () => cancelClassBookingAction(bookingId), { mail: true });
    if (hold.undone) {
      setSkippingId(null);
      return;
    }
    const result = hold.value;
    announceChange("booking");
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
    announceChange("booking");
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
      <h2 className="text-headline font-semibold text-balance text-slate-50">Your schedule</h2>

      {/* This week */}
      <div className="glass-surface rounded-2xl p-5 sm:p-6">
        <p className="text-small font-medium uppercase tracking-caps text-slate-400">This week</p>
        {hasClassThisWeek ? (
          <p className="mt-2 text-small text-slate-300">
            <span className="text-slate-50">✓ Booked</span>
          </p>
        ) : weeklyTime ? (
          <p className="mt-2 text-small text-slate-300">
            Your weekly time is <span className="text-slate-100">{DAY_LABELS[weeklyTime.dayOfWeek]}s at {formatTimeLabel(weeklyTime.startTime)}</span>.
          </p>
        ) : (
          <p className="mt-2 text-small text-slate-300">
            No weekly time set.{" "}
            <OpenSupportLink />
          </p>
        )}
      </div>

      {/* Your classes */}
      <div className="glass-surface rounded-2xl p-5 sm:p-6">
        <h2 className="text-title font-semibold text-slate-50">Your classes</h2>
        {upcomingBookings.length === 0 ? (
          <p className="mt-3 text-small text-slate-500">Nothing booked yet.</p>
        ) : (
          <div className="mt-2 divide-y divide-slate-50/8">
            {upcomingBookings.map((booking) => {
              const hoursUntil = (new Date(booking.scheduledAt).getTime() - Date.now()) / 3_600_000;
              const insideCutoff = hoursUntil < cancellationCutoffHours;
              const canChange = !insideCutoff && (canCancel || canReschedule);
              const confirming = confirmSkipId === booking.id;
              const busy = skippingId === booking.id;
              return (
                <div key={booking.id} className="py-4 first:pt-2 last:pb-1">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-small font-medium text-slate-100">{formatDateTime(booking.scheduledAt)}</p>
                      <p className="text-small text-slate-500">
                        {booking.label ?? "Weekly class"} · ends {formatEndTime(booking.scheduledAt, booking.creditsSpent)}
                      </p>
                    </div>
                    <span className="shrink-0 text-small text-slate-500">{Math.round((booking.creditsSpent / CREDITS_PER_CLASS) * CLASS_MINUTES)} min</span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {booking.inPerson && <span className="rounded-full bg-neu-base px-2.5 py-1 text-small font-medium text-slate-200 shadow-raised-low">In person</span>}
                    {hoursUntil <= 0.5 && hoursUntil > -1 && !booking.inPerson && (
                      <DiscordLink
                        href={booking.discordUrl ?? DISCORD_INVITE_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={buttonVariants({ variant: "primary", size: "sm" })}
                      >
                        Join on Discord
                      </DiscordLink>
                    )}
                    {hoursUntil > 0 && (
                      <a
                        href={`/api/calendar/class?s=${encodeURIComponent(booking.scheduledAt)}&m=${Math.round((booking.creditsSpent / CREDITS_PER_CLASS) * CLASS_MINUTES)}`}
                        className={buttonVariants({ variant: "secondary", size: "sm" })}
                      >
                        Add to calendar
                      </a>
                    )}
                    {canChange && !confirming && (
                      <>
                        {canReschedule && (
                          <Link href={`/lessons?tab=extra&move=${booking.id}`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                            Move this week
                          </Link>
                        )}
                        {canCancel && (
                          <button
                            type="button"
                            onClick={() => {
                              setSkipError(null);
                              setConfirmSkipId(booking.id);
                            }}
                            className={buttonVariants({ variant: "secondary", size: "sm" })}
                          >
                            Skip this class
                          </button>
                        )}
                      </>
                    )}
                    <MessageSupportButton bookingId={booking.id} className={buttonVariants({ variant: "ghost", size: "sm" })} />
                  </div>
                  {canChange ? (
                    confirming && (
                      <div className="mt-3 rounded-xl bg-neu-base px-3 py-2.5 shadow-pressed-low">
                        <p className="text-small text-slate-300">Skip this class? It stays on your account.</p>
                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            onClick={() => setConfirmSkipId(null)}
                            disabled={busy}
                            className={buttonVariants({ variant: "secondary", size: "sm" })}
                          >
                            Keep it
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSkip(booking.id)}
                            disabled={busy}
                            className={buttonVariants({ variant: "danger", size: "sm" })}
                          >
                            {busy && <MorphingSquare size={12} />}
                            {busy ? "Skipping…" : "Skip this class"}
                          </button>
                        </div>
                      </div>
                    )
                  ) : (
                    <p className="mt-2 text-small text-slate-500">
                      {insideCutoff ? `Starts within ${cancellationCutoffHours} hours, so changes now go through the team.` : "Changes to this class go through the team."}
                    </p>
                  )}
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
          <p className="mt-4 rounded-lg px-3.5 py-2.5 text-small text-slate-50 bg-neu-base shadow-raised-low">
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
                className={buttonVariants({ variant: "secondary", size: "sm" })}
              >
                Cancel
              </button>
            </div>
            {changeError && <p className="mt-2 text-small text-red-400">{changeError}</p>}
            {loadingSlots ? (
              <PulsatingDots className="mt-3 justify-start" label="Loading open times" />
            ) : !reservableSlots || reservableSlots.length === 0 ? (
              <p className="mt-3 text-small text-slate-500">
                Nothing open right now.
              </p>
            ) : (
              <div className="mt-3">
                <WeeklyTimePicker slots={reservableSlots} busyKey={changingSlotKey} onConfirm={handleChangeTime} />
              </div>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={openChangeTime}
            className={buttonVariants({ variant: "secondary", className: "mt-4 w-full text-left" })}
          >
            Change weekly time
          </button>
        )}
      </div>

    </WideLayout>
  );
}
