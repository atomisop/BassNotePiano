"use client";

import { CLASS_MINUTES, CREDITS_PER_CLASS } from "@/lib/classCreditPricing";
import { PulsatingDots } from "@/components/ui/pulsating-loader";
import { useEffect, useRef, useState } from "react";
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
import { JoinClassButton } from "@/components/lessons/JoinClassButton";
import { announceChange } from "@/lib/liveEvents";
import { toast } from "@/components/ui/Toaster";
import { Hint } from "@/components/ui/Hint";
import { ActionMenu } from "@/components/ui/ActionMenu";
import { Callout, CardFoot, Meta } from "@/components/ui/CardKit";
import { NextClassBand } from "@/components/lessons/NextClassBand";

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

/** Later classes shown before "Show N more" (DESIGN.md, Hierarchy 9). */
const LATER_SHOWN = 3;

/** The hero's two big parts: "Wednesday, Nov 12" and "6:00 PM", in the viewer's own clock like formatDateTime. */
function classDay(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}
function classTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
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
  /** "self": the student moves their own weekly time here. "team": a group plan's time is moved by the teacher (the server refuses it). */
  timeChange?: "self" | "team";
  /** Opened from a notice (?changeTime=): the picker is open on arrival. */
  openTimePicker?: boolean;
  /** "scheduleId:chunkIndex" to have chosen in the picker on arrival, when that time is open. */
  initialTimeKey?: string | null;
  /** Drawn right under the hero (the page's "What do you want to do?" tiles). */
  afterHero?: React.ReactNode;
}

export function ScheduleClient({
  cancellationCutoffHours,
  canCancel,
  canReschedule,
  hasClassThisWeek,
  weeklyTime,
  upcomingBookings,
  timeChange = "self",
  openTimePicker = false,
  initialTimeKey = null,
  afterHero,
}: ScheduleClientProps) {
  const router = useRouter();
  // Skipping one class (24+ hours ahead): two taps, then it is gone and its
  // credit stays on the account, to use on a different time under Extra sessions.
  const [confirmSkipId, setConfirmSkipId] = useState<string | null>(null);
  const [skippingId, setSkippingId] = useState<string | null>(null);
  const [skipError, setSkipError] = useState<string | null>(null);
  // A "Message support" inside a row's menu reports a failure here, shown under that row (the menu has closed by then).
  const [supportError, setSupportError] = useState<{ id: string; message: string } | null>(null);

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
    const slots = await getReservableSlotsForChangeAction().catch(() => [] as ReservableSlot[]);
    setLoadingSlots(false);
    setReservableSlots(slots);
  }

  // Arriving from a notice about a weekly time: the picker opens right away, scrolled into view, with that time chosen.
  const pickerRef = useRef<HTMLDivElement>(null);
  const openedOnArrival = useRef(false);
  useEffect(() => {
    if (!openTimePicker || timeChange !== "self" || openedOnArrival.current) return;
    openedOnArrival.current = true;
    void openChangeTime().then(() => pickerRef.current?.scrollIntoView({ block: "center", behavior: "smooth" }));
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openTimePicker, timeChange]);

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

  // Everything a class's buttons need to know, worked out once per class.
  function classState(booking: UpcomingBooking) {
    const hoursUntil = (new Date(booking.scheduledAt).getTime() - Date.now()) / 3_600_000;
    const insideCutoff = hoursUntil < cancellationCutoffHours;
    const canChange = !insideCutoff && (canCancel || canReschedule);
    const minutes = Math.round((booking.creditsSpent / CREDITS_PER_CLASS) * CLASS_MINUTES);
    return {
      hoursUntil,
      insideCutoff,
      canChange,
      minutes,
      joinNow: hoursUntil <= 0.5 && hoursUntil > -1 && !booking.inPerson,
      calendarHref: hoursUntil > 0 ? `/api/calendar/class?s=${encodeURIComponent(booking.scheduledAt)}&m=${minutes}` : null,
      confirming: confirmSkipId === booking.id,
      busy: skippingId === booking.id,
      lockedNote: canChange ? null : insideCutoff ? `Starts within ${cancellationCutoffHours} hours, so changes now go through the team.` : "Changes to this class go through the team.",
    };
  }

  // The two-step skip, shown under whichever class asked for it.
  function skipConfirm(booking: UpcomingBooking, busy: boolean) {
    return (
      <div className="mt-3 rounded-xl bg-neu-base px-3 py-2.5 shadow-pressed-low">
        <p className="text-small text-slate-300"><Hint>Skip this class? It stays on your account.</Hint></p>
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
    );
  }

  const startSkip = (bookingId: string) => {
    setSkipError(null);
    setConfirmSkipId(bookingId);
  };

  const weeklyLine = weeklyTime ? `Every ${DAY_LABELS[weeklyTime.dayOfWeek]} at ${formatTimeLabel(weeklyTime.startTime)}` : null;
  const [next, ...later] = upcomingBookings;
  const nextState = next ? classState(next) : null;
  const laterFirst = later.slice(0, LATER_SHOWN);
  const laterRest = later.slice(LATER_SHOWN);

  // One row per later class: the day and time to read, one quiet line, and every change behind "More" (DESIGN.md, Hierarchy 6 and 8).
  const laterRow = (booking: UpcomingBooking) => {
    const c = classState(booking);
    return (
      <li key={booking.id} className="py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-body font-semibold tabular-nums text-slate-50">{formatDateTime(booking.scheduledAt)}</p>
            <Meta
              className="mt-0.5"
              items={[booking.label ?? "Weekly class", `ends ${formatEndTime(booking.scheduledAt, booking.creditsSpent)}`, booking.inPerson && "In person", c.lockedNote && "Changes go through the team"]}
            />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {c.joinNow && (
              <JoinClassButton href={booking.discordUrl ?? DISCORD_INVITE_URL} bookingId={booking.id} label="Join" className={buttonVariants({ variant: "primary", size: "sm" })} />
            )}
            {!c.confirming && (
              <ActionMenu label="More" align="right">
                {c.calendarHref && (
                  <a href={c.calendarHref} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                    Add to calendar
                  </a>
                )}
                {c.canChange && canReschedule && (
                  <Link href={`/lessons?tab=extra&move=${booking.id}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                    Move this week
                  </Link>
                )}
                <MessageSupportButton
                  bookingId={booking.id}
                  onError={(message) => setSupportError(message ? { id: booking.id, message } : null)}
                  className={buttonVariants({ variant: "ghost", size: "sm" })}
                />
                {c.canChange && canCancel && (
                  <button type="button" onClick={() => startSkip(booking.id)} className={buttonVariants({ variant: "ghost", size: "sm", className: "text-red-300 hover:text-red-200" })}>
                    Skip this class
                  </button>
                )}
              </ActionMenu>
            )}
          </div>
        </div>
        {supportError?.id === booking.id && (
          <p role="alert" className="mt-2 text-small text-red-400">
            {supportError.message}
          </p>
        )}
        {c.canChange && c.confirming && skipConfirm(booking, c.busy)}
      </li>
    );
  };

  return (
    <WideLayout className="space-y-6">
      <h2 className="sr-only">Your schedule</h2>

      {/* The hero: the next class on a coloured band, its time the biggest thing on the screen, the controls on the sheet under it. */}
      {next && nextState ? (
        <NextClassBand
          day={classDay(next.scheduledAt)}
          time={classTime(next.scheduledAt)}
          meta={
            <Meta
              items={[
                `Ends ${formatEndTime(next.scheduledAt, next.creditsSpent)}`,
                `${nextState.minutes} min`,
                next.inPerson ? "In person" : (next.label ?? "Weekly class"),
                hasClassThisWeek && "This week is booked",
              ]}
            />
          }
        >
          {nextState.lockedNote && <p className="pt-3 text-small text-slate-500">{nextState.lockedNote}</p>}
          {nextState.confirming && nextState.canChange ? (
            skipConfirm(next, nextState.busy)
          ) : (
            <CardFoot className="mt-0 justify-between border-t-0 pt-3">
              {/* The rare jobs (asking support, skipping) sit in one quiet menu, Skip last and red, so the row fits on a phone and the
                  everyday buttons on the right stay the obvious ones. */}
              <ActionMenu label="More">
                <MessageSupportButton
                  bookingId={next.id}
                  onError={(message) => setSupportError(message ? { id: next.id, message } : null)}
                  className={buttonVariants({ variant: "ghost", size: "sm" })}
                />
                {nextState.canChange && canCancel && (
                  <button type="button" onClick={() => startSkip(next.id)} className={buttonVariants({ variant: "ghost", size: "sm", className: "text-red-300 hover:text-red-200" })}>
                    Skip this class
                  </button>
                )}
              </ActionMenu>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {nextState.canChange && canReschedule && (
                  <Link href={`/lessons?tab=extra&move=${next.id}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                    Move
                  </Link>
                )}
                {nextState.calendarHref && (
                  <a href={nextState.calendarHref} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                    Add to calendar
                  </a>
                )}
                {nextState.joinNow && (
                  <JoinClassButton href={next.discordUrl ?? DISCORD_INVITE_URL} bookingId={next.id} className={buttonVariants({ variant: "primary", size: "sm" })} />
                )}
              </div>
              {supportError?.id === next.id && <p role="alert" className="basis-full text-right text-small text-red-400">{supportError.message}</p>}
            </CardFoot>
          )}
          {skipError && (
            <div className="flex flex-wrap items-center gap-3 pb-1" role="alert">
              <p className="text-small text-red-400">{skipError}</p>
              {errorNeedsTeam(skipError) && <MessageSupportButton problem={skipError} label="Message support about this" />}
            </div>
          )}
        </NextClassBand>
      ) : (
        <NextClassBand day={weeklyLine ?? "Nothing booked yet"} meta={weeklyLine ? <Meta items={[hasClassThisWeek ? "This week is booked" : "Your weekly time", "Nothing else booked yet"]} /> : undefined}>
          {!weeklyLine && timeChange === "team" ? (
            <p className="pt-3 text-small text-slate-500">You book each class yourself with your credits, under Book a class.</p>
          ) : !weeklyLine ? (
            <Callout tone="neutral" className="mt-3">
              No weekly time yet. Pick one below and every class in your plan is booked.
            </Callout>
          ) : null}
          {skipError && (
            <div className="flex flex-wrap items-center gap-3 pb-1" role="alert">
              <p className="text-small text-red-400">{skipError}</p>
              {errorNeedsTeam(skipError) && <MessageSupportButton problem={skipError} label="Message support about this" />}
            </div>
          )}
        </NextClassBand>
      )}

      {afterHero}

      {/* The rest, as rows: a few shown, the others folded. */}
      <section aria-label="Your classes" className="rounded-card bg-neu-base p-5 shadow-raised-low sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-small font-semibold uppercase tracking-caps text-slate-400">Your classes</h2>
          {upcomingBookings.length > 0 && (
            <span className="min-w-7 rounded-full bg-slate-50/8 px-2 py-0.5 text-center text-small font-semibold tabular-nums text-slate-100">{upcomingBookings.length}</span>
          )}
        </div>
        {later.length === 0 ? (
          <p className="mt-3 text-small text-slate-500">{next ? "Nothing else booked yet." : "Nothing booked yet."}</p>
        ) : (
          <ul className="mt-1 divide-y divide-slate-50/8">
            {laterFirst.map(laterRow)}
            {laterRest.length > 0 && (
              <li>
                <details className="group/more">
                  <summary className="tap flex cursor-pointer list-none items-center py-3 text-small font-medium text-slate-400 hover:text-slate-200 group-open/more:hidden [&::-webkit-details-marker]:hidden">
                    Show {laterRest.length} more
                  </summary>
                  <ul className="divide-y divide-slate-50/8">{laterRest.map(laterRow)}</ul>
                </details>
              </li>
            )}
          </ul>
        )}

        {/* Self-service move of the standing weekly reservation, gated the same way solo self-reschedule is (a real open slot, no
            conflicts) via changeReservedSlot. The weekly time is the fact; changing it is the quiet action beside it. */}
        {changeSuccess && (
          <p className="mt-4 rounded-lg px-3.5 py-2.5 text-small text-slate-50 bg-neu-base shadow-raised-low">
            Your weekly time changed.
          </p>
        )}

        {timeChange === "team" ? (
          // A group plan's weekly time is moved by the teacher so everyone stays together: ask for it here, in one tap.
          weeklyTime && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-50/8 pt-3">
              <div className="min-w-0">
                <p className="truncate text-body font-medium text-slate-100">{weeklyLine}</p>
                <p className="text-caption text-slate-500">Weekly time · the teacher moves a group plan&apos;s time</p>
              </div>
              <MessageSupportButton
                problem={`I would like to move my group plan's weekly time (now ${DAY_LABELS[weeklyTime.dayOfWeek]}s at ${formatTimeLabel(weeklyTime.startTime)}).`}
                label="Ask to move it"
                className={buttonVariants({ variant: "ghost", size: "sm", className: "shrink-0" })}
              />
            </div>
          )
        ) : changingTime ? (
          <div ref={pickerRef} className="mt-4 rounded-lg p-3.5 bg-neu-base shadow-raised-low">
            <div className="flex items-center justify-between gap-3">
              <p className="text-small font-medium text-slate-300"><Hint>Pick a new weekly time</Hint></p>
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
                <WeeklyTimePicker slots={reservableSlots} busyKey={changingSlotKey} onConfirm={handleChangeTime} initialKey={initialTimeKey} />
              </div>
            )}
          </div>
        ) : (
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-50/8 pt-3">
            <div className="min-w-0">
              <p className="truncate text-body font-medium text-slate-100">{weeklyLine ?? "No weekly time"}</p>
              <p className="text-caption text-slate-500">Weekly time</p>
            </div>
            {/* With no weekly time yet, picking one is the thing to do next, so it is the one raised button; otherwise a quiet Change. */}
            <button
              type="button"
              onClick={openChangeTime}
              className={buttonVariants({ variant: weeklyTime ? "ghost" : "primary", size: "sm", className: "shrink-0" })}
            >
              {weeklyTime ? "Change" : "Pick a time"}
            </button>
          </div>
        )}
      </section>

    </WideLayout>
  );
}
