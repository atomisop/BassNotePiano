"use client";

import { scrollWithin } from "@/lib/scrollWithin";
import { useEffect, useMemo, useRef, useState } from "react";
import { newIdempotencyKey } from "@/lib/idempotencyClient";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { bookClassBundleAction, bookFamilyClassAction, checkFamilyClassAttendeesAction, cancelClassBookingAction, rescheduleClassBookingAction } from "./actions";
import { BookingAgenda, type AgendaRow } from "./BookingAgenda";
import { BookingCalendar, dayKey } from "./BookingCalendar";
import { formatDateTime, formatEndTime } from "@/lib/classScheduleLabels";
import { CheckIcon } from "@/components/ui/icons";
import { CREDITS_PER_CLASS, EXTRA_CLASS_PRICE_CENTS, formatCredits, storedToCredits } from "@/lib/classCreditPricing";
import { errorNeedsTeam } from "@/lib/bookingRules";
import { ZelleUnlockGate } from "@/components/billing/ZelleUnlockGate";
import { createExtraClassPaymentAction, createFifthClassPaymentAction, submitClassCreditsPaymentAction } from "../billing/lessons/actions";
import { toast } from "@/components/ui/Toaster";
import { ZellePaymentStatus } from "@prisma/client";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { WideLayout } from "@/components/layout/PageLayouts";
import { Ticket } from "@/components/ui/appIcons";
import { Tabs } from "@/components/ui/Tabs";
import { MessageSupportButton } from "@/components/lessons/MessageSupportButton";
import { buttonVariants } from "@/components/ui/button";
import { announceChange } from "@/lib/liveEvents";
import { NETWORK_ERROR, type OccurrenceRow, type BookingRow, type BookingMode, type TabId, formatOccurrenceDay, creditsLabel, weekStartMs, formatOccurrenceTime, groupOccurrencesByWeek, groupByMonth, BookingCard, MonthGroup, AttendeeEmailRow } from "./BookingParts";

export function ClassBookingClient({
  initialCredits,
  cancellationCutoffHours,
  canCancel,
  canReschedule,
  soloMaxCredits,
  familyMinAttendees,
  familyCreditsPerStudent,
  occurrences,
  initialBookings,
  zelleHandle,
  extraMode = false,
  weeklyLimited = false,
  fifthClassOffer = null,
  extraClassCents = EXTRA_CLASS_PRICE_CENTS,
}: {
  /** What one extra class costs now (Admin > Pricing). */
  extraClassCents?: number;
  /** A Monthly subscriber's optional fifth class (their cycle holds five of their weekday): when it is, and the price. */
  fifthClassOffer?: { scheduledAt: string; priceCents: number } | null;
  /** A student on a payment plan: this is where they book EXTRA sessions on top of their weekly class. */
  extraMode?: boolean;
  /** A subscriber: credits book one class a week, anything more that week is paid extra time. */
  weeklyLimited?: boolean;
  initialCredits: number;
  cancellationCutoffHours: number;
  canCancel: boolean;
  canReschedule: boolean;
  soloMaxCredits: number;
  familyMinAttendees: number;
  familyCreditsPerStudent: number;
  occurrences: OccurrenceRow[];
  initialBookings: BookingRow[];
  zelleHandle: string;
}) {
  const [credits, setCredits] = useState(initialCredits);
  const [extraPayment, setExtraPayment] = useState<{ id: string; status: ZellePaymentStatus; amountCents: number; when: string } | null>(null);
  const [payBusyKey, setPayBusyKey] = useState<string | null>(null);
  const [bookings, setBookings] = useState(initialBookings);
  const [rows, setRows] = useState(occurrences);

  // The page re-fetches its data in the background (AutoRefresh), so a class
  // booked or canceled from elsewhere shows up here without a reload. Compared
  // by content so an unchanged refresh does not reset anything.
  const occurrencesSig = JSON.stringify(occurrences);
  const bookingsSig = JSON.stringify(initialBookings);
  useEffect(() => setRows(occurrences), [occurrencesSig]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setBookings(initialBookings), [bookingsSig]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setCredits(initialCredits), [initialCredits]);
  const [mode, setMode] = useState<BookingMode>("SOLO");
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  // Set by tapping "Reschedule" on an upcoming booking: while set, every open
  // time offers "Move here" instead of being added to the selection. Only one
  // reschedule is ever in flight at a time.
  const [reschedulingBooking, setReschedulingBooking] = useState<BookingRow | null>(null);
  const [reschedulingKey, setReschedulingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  // Set by tapping a day on the calendar: the times for that day appear below it. It starts on the first day
  // with an open time, so the list of open and taken times is on screen the moment the page opens.
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(() => {
    const first = occurrences.filter((o) => !o.isBooked).sort((a, b) => a.occurrenceDateMs - b.occurrenceDateMs)[0];
    return first ? dayKey(first.occurrenceDateMs) : null;
  });
  const firstDayRef = useRef(true);
  // Every time the student has tapped, across days. Keyed `scheduleId:occurrenceDateMs:chunkIndex`.
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const timesRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<TabId>("book");
  const [bundleSubmitting, setBundleSubmitting] = useState(false);

  // Family booking: which occurrence, and the list of attendee emails being
  // typed in. Only one family booking is composed at a time.
  const [familyRowKey, setFamilyRowKey] = useState<string | null>(null);
  const [familyEmails, setFamilyEmails] = useState<string[]>(["", ""]);
  const [familyChecks, setFamilyChecks] = useState<Record<string, { checking: boolean; found: boolean; verified: boolean; name: string | null }>>({});
  const [familySubmitting, setFamilySubmitting] = useState(false);

  // /lessons?tab=extra&move=<bookingId> (from the weekly class page) opens straight into moving that class.
  const moveId = useSearchParams().get("move");
  const startedMoveRef = useRef<string | null>(null);
  useEffect(() => {
    if (!moveId || startedMoveRef.current === moveId) return;
    const target = initialBookings.find((b) => b.id === moveId && b.status === "SCHEDULED");
    if (!target) return;
    startedMoveRef.current = moveId;
    startReschedule(target);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const rowKey = (r: OccurrenceRow) => `${r.scheduleId}:${r.occurrenceDateMs}:${r.chunkIndex}`;

  // A class is always one fixed length, so a time books for its whole window.
  function creditsFor(row: OccurrenceRow): number {
    return Math.min(row.creditCost, soloMaxCredits);
  }

  // No times at all until a day is tapped; then exactly that day's, in order.
  const displayRows = useMemo(
    () =>
      selectedDateKey
        ? rows.filter((r) => dayKey(r.occurrenceDateMs) === selectedDateKey).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
        : [],
    [rows, selectedDateKey],
  );

  // Tapping a day jumps straight to that day's times.
  useEffect(() => {
    // Not on the first paint: the page should open at the top, not jump down to the times.
    if (firstDayRef.current) {
      firstDayRef.current = false;
      return;
    }
    if (!selectedDateKey) return;
    scrollWithin(timesRef.current, "start");
  }, [selectedDateKey]);

  const selectedRows = useMemo(() => rows.filter((r) => selectedKeys.has(rowKey(r))), [rows, selectedKeys]);
  const selectedCreditTotal = useMemo(() => selectedRows.reduce((sum, r) => sum + Math.min(r.creditCost, soloMaxCredits), 0), [selectedRows, soloMaxCredits]);
  const missingCredits = Math.max(0, selectedCreditTotal - credits);

  // Weeks (Sunday to Saturday) in which a subscriber already holds a class, and
  // weeks they have already picked a time in. A second credit class in either
  // is not available: that is paid extra time.
  const heldWeeks = useMemo(() => {
    const set = new Set<number>();
    if (!weeklyLimited) return set;
    for (const b of bookings) {
      if ((b.status === "SCHEDULED" || b.status === "COMPLETED") && b.occurrenceDateMs !== undefined && b.id !== reschedulingBooking?.id) {
        set.add(weekStartMs(b.occurrenceDateMs));
      }
    }
    return set;
  }, [bookings, weeklyLimited, reschedulingBooking]);
  const pickedWeeks = useMemo(() => new Set(selectedRows.map((r) => weekStartMs(r.occurrenceDateMs))), [selectedRows]);

  function toggleSelected(row: OccurrenceRow) {
    const key = rowKey(row);
    setError(null);
    setSuccess(null);
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // The month agenda (wide screens): a tap picks the day, and in the plain just-me case also picks that time. In every other case
  // (family, moving a class, a weekly limit) it only opens the day, where the cards with their own buttons are.
  const agendaRows = useMemo<AgendaRow[]>(
    () => rows.map((r) => ({ key: rowKey(r), occurrenceDateMs: r.occurrenceDateMs, scheduledAt: r.scheduledAt, durationMin: r.durationMin, isBooked: r.isBooked, reservedForYou: r.reservedForYou })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows],
  );
  function pickFromAgenda(key: string, day: string) {
    setSelectedDateKey(day);
    const row = rows.find((r) => rowKey(r) === key);
    if (row && !row.isBooked && mode === "SOLO" && !reschedulingBooking && !weeklyLimited) toggleSelected(row);
  }

  const occurrenceGroups = useMemo(() => groupOccurrencesByWeek(displayRows), [displayRows]);
  const upcoming = useMemo(() => bookings.filter((b) => b.status === "SCHEDULED").sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)), [bookings]);
  const history = useMemo(() => bookings.filter((b) => b.status !== "SCHEDULED"), [bookings]);
  const historyGroups = useMemo(() => groupByMonth(history), [history]);

  /** Books every picked time in one go. Each is its own attempt server-side, so one taken slot does not undo the rest. */
  async function handleBookSelected() {
    if (selectedRows.length === 0) return;
    setError(null);
    setSuccess(null);
    setBundleSubmitting(true);

    const picked = selectedRows;
    const selections = picked.map((r) => ({
      scheduleId: r.scheduleId,
      occurrenceDateMs: r.occurrenceDateMs,
      chunkIndex: r.chunkIndex,
      creditsToBook: creditsFor(r),
    }));
    let result: Awaited<ReturnType<typeof bookClassBundleAction>>;
    try {
      result = await bookClassBundleAction(selections);
      announceChange("booking");
    } catch {
      setError(NETWORK_ERROR);
      return;
    } finally {
      setBundleSubmitting(false);
    }

    if (!result.ok) {
      setError(result.error);
      return;
    }

    const succeeded = result.results.filter((r) => r.ok);
    const failed = result.results.filter((r) => !r.ok);
    const succeededKeys = new Set(succeeded.map((r) => `${r.scheduleId}:${r.occurrenceDateMs}:${r.chunkIndex}`));
    // Keep the times that did not book selected, so nothing the student chose silently disappears.
    setSelectedKeys(new Set(picked.filter((r) => !succeededKeys.has(rowKey(r))).map(rowKey)));

    if (succeeded.length > 0) {
      const succeededRows = picked.filter((r) => succeededKeys.has(rowKey(r)));
      setCredits((c) => c - succeededRows.reduce((sum, r) => sum + creditsFor(r), 0));
      setRows((prev) => prev.map((r) => (succeededKeys.has(rowKey(r)) ? { ...r, isBooked: true } : r)));
      setBookings((prev) => [
        ...succeeded.map((r) => {
          const row = succeededRows.find((sr) => sr.scheduleId === r.scheduleId && sr.occurrenceDateMs === r.occurrenceDateMs && sr.chunkIndex === r.chunkIndex)!;
          return {
            id: r.bookingId!,
            occurrenceDateMs: row.occurrenceDateMs,
            label: row.label,
            scheduledAt: row.scheduledAt,
            creditsSpent: creditsFor(row),
            status: "SCHEDULED" as const,
            refunded: false,
            attendance: null,
            canceledReason: null,
          };
        }),
        ...prev,
      ]);
    }

    if (failed.length === 0) {
      setSuccess(`Booked ${succeeded.length} class${succeeded.length === 1 ? "" : "es"}. You can see ${succeeded.length === 1 ? "it" : "them"} under Upcoming.`);
    } else if (succeeded.length === 0) {
      setError(failed[0]!.error ?? "Couldn't book those classes.");
    } else {
      setError(`Booked ${succeeded.length} of ${result.results.length}. ${failed[0]!.error ?? ""}`.trim());
    }
  }

  async function handleCancel(booking: BookingRow) {
    setError(null);
    setSuccess(null);
    setCancelingId(booking.id);
    let result: Awaited<ReturnType<typeof cancelClassBookingAction>>;
    try {
      const hold = await toast.held("Canceling your class", () => cancelClassBookingAction(booking.id), { mail: true });
      if (hold.undone) return;
      result = hold.value;
      announceChange("booking");
    } catch {
      setError(NETWORK_ERROR);
      return;
    } finally {
      setCancelingId(null);
    }

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setBookings((prev) => prev.map((b) => (b.id === booking.id ? { ...b, status: "CANCELED", refunded: true } : b)));
    // Frees the reservation; nothing was charged yet (see cancelClassBookingAction).
    setCredits((c) => c + booking.creditsSpent);
    setSuccess("Canceled. No credits were used.");
  }

  function startReschedule(booking: BookingRow) {
    setError(null);
    setSuccess(null);
    // Pressing the same booking's button again cancels the in-progress pick.
    setReschedulingBooking((prev) => (prev?.id === booking.id ? null : booking));
    setTab("book");
    setMode("SOLO");
    setSelectedKeys(new Set());
    setFamilyRowKey(null);
    setTimeout(() => scrollWithin(document.getElementById("booking-calendar"), "start"), 50);
  }

  async function handleReschedule(row: OccurrenceRow) {
    if (!reschedulingBooking) return;
    const key = rowKey(row);
    const chosen = creditsFor(row);
    const oldBooking = reschedulingBooking;
    setError(null);
    setSuccess(null);
    setReschedulingKey(key);
    let result: Awaited<ReturnType<typeof rescheduleClassBookingAction>>;
    try {
      result = await rescheduleClassBookingAction(oldBooking.id, row.scheduleId, row.occurrenceDateMs, row.chunkIndex, chosen);
      announceChange("booking");
    } catch {
      setError(NETWORK_ERROR);
      return;
    } finally {
      setReschedulingKey(null);
    }

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setReschedulingBooking(null);
    // The old time is open again, unless it is the very time just picked.
    setRows((prev) =>
      prev.map((r) => {
        if (rowKey(r) === key) return { ...r, isBooked: true };
        if (r.scheduledAt === oldBooking.scheduledAt) return { ...r, isBooked: false };
        return r;
      }),
    );
    setBookings((prev) => [
      {
        id: result.id,
        occurrenceDateMs: row.occurrenceDateMs,
        label: row.label,
        scheduledAt: row.scheduledAt,
        creditsSpent: chosen,
        status: "SCHEDULED",
        refunded: false,
        attendance: null,
        canceledReason: null,
        reserved: oldBooking.reserved,
      },
      ...prev.filter((b) => b.id !== oldBooking.id),
    ]);
    // Only a net change if the two classes differ in length.
    setCredits((c) => c + oldBooking.creditsSpent - chosen);
    setSuccess("Rescheduled. The teacher has been told.");
    setTab("upcoming");
  }

  /** Extra time the credits cannot pay for (a second class in a week the plan already covers): the one place money is still involved. */
  async function startExtraPayment(row: OccurrenceRow) {
    setError(null);
    setSuccess(null);
    setPayBusyKey(rowKey(row));
    try {
      const result = await createExtraClassPaymentAction(row.scheduleId, row.occurrenceDateMs, row.chunkIndex);
      announceChange("booking");
      if (!result.ok || !result.id || !result.status || result.amountCents === null) {
        const message = result.error ?? "Something went wrong. Please try again.";
        setError(message);
        toast.error("Couldn't start that payment", { description: message, action: { label: "Retry", onClick: () => void startExtraPayment(row) } });
        return;
      }
      setExtraPayment({
        id: result.id,
        status: result.status as ZellePaymentStatus,
        amountCents: result.amountCents,
        when: `${formatOccurrenceDay(row.scheduledAt)}, ${formatOccurrenceTime(row.scheduledAt)}`,
      });
    } catch {
      setError(NETWORK_ERROR);
      toast.error("Couldn't start that payment", { description: NETWORK_ERROR, action: { label: "Retry", onClick: () => void startExtraPayment(row) } });
    } finally {
      setPayBusyKey(null);
    }
  }

  /** The optional fifth class: same pay screen as extra time, at the owner's price. */
  async function startFifthClassPayment() {
    if (!fifthClassOffer) return;
    setError(null);
    setSuccess(null);
    setPayBusyKey("fifth");
    try {
      const result = await createFifthClassPaymentAction();
      announceChange("booking");
      if (!result.ok || !result.id || !result.status || result.amountCents === null) {
        const message = result.error ?? "Something went wrong. Please try again.";
        setError(message);
        toast.error("Couldn't start that payment", { description: message, action: { label: "Retry", onClick: () => void startFifthClassPayment() } });
        return;
      }
      setExtraPayment({
        id: result.id,
        status: result.status as ZellePaymentStatus,
        amountCents: result.amountCents,
        when: `${formatOccurrenceDay(fifthClassOffer.scheduledAt)}, ${formatOccurrenceTime(fifthClassOffer.scheduledAt)}`,
      });
    } catch {
      setError(NETWORK_ERROR);
      toast.error("Couldn't start that payment", { description: NETWORK_ERROR, action: { label: "Retry", onClick: () => void startFifthClassPayment() } });
    } finally {
      setPayBusyKey(null);
    }
  }

  function openFamilyBooking(row: OccurrenceRow) {
    setFamilyRowKey(rowKey(row));
    setFamilyEmails(["", ""]);
    setFamilyChecks({});
    setError(null);
    setSuccess(null);
  }

  function updateFamilyEmail(index: number, value: string) {
    setFamilyEmails((prev) => prev.map((e, i) => (i === index ? value : e)));
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) {
      checkFamilyEmail(value.trim());
    }
  }

  async function checkFamilyEmail(rawEmail: string) {
    // Results are looked up by the lowercase address, so store them under it too.
    const email = rawEmail.trim().toLowerCase();
    setFamilyChecks((prev) => ({ ...prev, [email]: { checking: true, found: false, verified: false, name: null } }));
    let results: Awaited<ReturnType<typeof checkFamilyClassAttendeesAction>>;
    try {
      results = await checkFamilyClassAttendeesAction([email]);
    } catch {
      setFamilyChecks((prev) => ({ ...prev, [email]: { checking: false, found: false, verified: false, name: null } }));
      return;
    }
    const result = results[0];
    if (!result) return;
    setFamilyChecks((prev) => ({ ...prev, [email]: { checking: false, found: result.found, verified: result.verified, name: result.name } }));
  }

  const familyRow = rows.find((r) => rowKey(r) === familyRowKey) ?? null;
  const familyEmailsTrimmed = familyEmails.map((e) => e.trim().toLowerCase()).filter(Boolean);
  const familyAllVerified =
    familyEmailsTrimmed.length >= familyMinAttendees && familyEmailsTrimmed.every((e) => familyChecks[e]?.verified);

  // One key per attempt: a double tap or a retry books the class once. A new key once it worked.
  const familyKey = useRef(newIdempotencyKey());

  async function handleBookFamily() {
    if (!familyRow || !familyAllVerified) return;
    setError(null);
    setSuccess(null);
    setFamilySubmitting(true);
    let result: Awaited<ReturnType<typeof bookFamilyClassAction>>;
    try {
      result = await bookFamilyClassAction(familyRow.scheduleId, familyRow.occurrenceDateMs, familyRow.chunkIndex, familyEmailsTrimmed, familyKey.current);
      announceChange("booking");
    } catch {
      setError(NETWORK_ERROR);
      return;
    } finally {
      setFamilySubmitting(false);
    }

    if (!result.ok) {
      setError(result.error);
      return;
    }

    familyKey.current = newIdempotencyKey();
    setRows((prev) => prev.map((r) => (rowKey(r) === rowKey(familyRow) ? { ...r, isBooked: true } : r)));
    setFamilyRowKey(null);
    setFamilyEmails(["", ""]);
    setFamilyChecks({});
    setSuccess(`Booked for ${familyEmailsTrimmed.length} students, ${creditsLabel(familyCreditsPerStudent)} reserved from each.`);
  }

  const actionClass =
    "tap flex min-h-9 shrink-0 items-center justify-center rounded-full px-4 py-2 text-small font-semibold transition disabled:cursor-not-allowed disabled:text-slate-500 bg-neu-base shadow-raised-low hover:shadow-raised-mid active:shadow-pressed-low text-slate-50";
  const bookingBarVisible = tab === "book" && mode === "SOLO" && !reschedulingBooking && selectedKeys.size > 0 && !extraPayment;

  return (
    <WideLayout>
      {/* One column on phones and tablets. From lg up the Book tab uses the width: times on the left, the calendar on the right. */}
      <div className="mx-auto w-full max-w-2xl lg:max-w-6xl">
      {/* The page's own title ("Lessons") sits above this on the page; this names the section. */}
      <h2 className="text-headline font-semibold text-balance text-slate-50">{extraMode ? "Book an extra class" : "Book a class"}</h2>

      <div className="mt-(--space-group)">
        <Tabs<TabId>
          label="Booking, upcoming and past classes"
          value={tab}
          onChange={(next) => {
            setError(null);
            setSuccess(null);
            setTab(next);
          }}
          items={[
            { id: "book", label: "Book" },
            { id: "upcoming", label: "Upcoming", count: upcoming.length || undefined },
            { id: "past", label: "Past", count: history.length || undefined },
          ]}
        />
      </div>

      <div className="mt-(--space-group)">
        {error && (
          <div className="mb-4 flex flex-wrap items-center gap-3" role="alert">
            <p className="text-small text-red-400">{error}</p>
            {errorNeedsTeam(error) && <MessageSupportButton problem={error} label="Message support about this" />}
          </div>
        )}
        {success && <p className="mb-4 text-small text-slate-50" role="status">{success}</p>}

        {tab === "book" && (
          <div className="min-w-0">
            {fifthClassOffer && !extraPayment && (
              <div className="glass-surface mt-4 flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="text-body font-semibold text-slate-50">
                    A fifth class this cycle: {formatOccurrenceDay(fifthClassOffer.scheduledAt)}, {formatOccurrenceTime(fifthClassOffer.scheduledAt)}
                  </p>
                  <p className="text-small text-slate-500">
                    Your billing cycle holds five of your class day and your plan covers four. Add the last one for ${(fifthClassOffer.priceCents / 100).toFixed(fifthClassOffer.priceCents % 100 === 0 ? 0 : 2)}, or skip it, nothing changes.
                  </p>
                </div>
                <button type="button" onClick={startFifthClassPayment} disabled={payBusyKey !== null} className={actionClass}>
                  {payBusyKey === "fifth" && <MorphingSquare size={12} className="mr-1.5 shrink-0" />}
                  Add it · ${(fifthClassOffer.priceCents / 100).toFixed(fifthClassOffer.priceCents % 100 === 0 ? 0 : 2)}
                </button>
              </div>
            )}

            {/* One row: who the class is for, and the credits there are to spend. */}
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <Tabs
                label="Who is this class for?"
                items={[
                  { id: "SOLO", label: "Just me" },
                  { id: "FAMILY", label: "Me and my family" },
                ]}
                value={mode}
                onChange={(m) => {
                  setMode(m);
                  setSelectedKeys(new Set());
                  setFamilyRowKey(null);
                }}
              />
              <p
                className="flex items-center gap-2 rounded-full bg-neu-base px-3.5 py-2 text-small font-semibold tabular-nums text-slate-50 shadow-pressed-low"
                aria-label={`${formatCredits(storedToCredits(credits))} credits to spend`}
              >
                <Ticket aria-hidden className="h-4 w-4 text-signal-fg" strokeWidth={1.75} />
                {formatCredits(storedToCredits(credits))}
              </p>
            </div>

            {reschedulingBooking && (
              <div className="glass-surface-elevated mt-5 flex flex-wrap items-center justify-between gap-4 p-5">
                <p className="text-small font-medium text-slate-100">
                  Moving {reschedulingBooking.label ?? "your class"} · {formatDateTime(reschedulingBooking.scheduledAt)}
                  {reschedulingBooking.reserved && <span className="font-normal text-slate-500"> (this week only, your weekly time stays)</span>}
                </p>
                <button type="button" onClick={() => setReschedulingBooking(null)} className={buttonVariants({ variant: "secondary", size: "sm", className: "shrink-0" })}>
                  Never mind
                </button>
              </div>
            )}

            {/* The calendar and the day's times side by side from lg up, so picking a time needs no scrolling on a computer. */}
            <div className="mt-5 lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-8">
            <div className="space-y-4 lg:order-2 lg:sticky lg:top-0">
            {rows.length > 0 ? (
              <div id="booking-calendar" className="scroll-mt-20">
                <BookingCalendar occurrences={rows} selectedDateKey={selectedDateKey} onSelectDate={setSelectedDateKey} />
              </div>
            ) : (
              <p className="text-small text-slate-500">No classes scheduled.</p>
            )}
            {rows.length > 0 && (
              <p className="hidden items-center gap-4 px-1 text-small text-slate-400 lg:flex">
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-signal" aria-hidden />Open {rows.filter((r) => !r.isBooked).length}</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-slate-500" aria-hidden />Taken {rows.filter((r) => r.isBooked).length}</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[rgb(var(--tint-green-fg))]" aria-hidden />Picked {selectedKeys.size}</span>
              </p>
            )}
            {/* The next few booked classes, beside the calendar on a computer (the Upcoming tab still has them all). */}
            {upcoming.length > 0 && (
              <div className="hidden rounded-2xl bg-neu-base shadow-raised-mid p-4 lg:block">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-small font-semibold text-slate-50">Upcoming classes</p>
                  <button type="button" onClick={() => setTab("upcoming")} className="text-small text-signal-fg hover:underline">
                    See all
                  </button>
                </div>
                <ul className="space-y-2">
                  {upcoming.slice(0, 3).map((b, i) => (
                    <li key={b.id} className={`${["tint-purple", "tint-peach", "tint-blue"][i % 3]} rounded-xl px-3 py-2.5`}>
                      <p className="text-small font-semibold">{formatDateTime(b.scheduledAt)}</p>
                      {b.label && <p className="text-small opacity-80">{b.label}</p>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            </div>

              <div className="min-w-0 lg:order-1">
            {rows.length > 0 && (
              <div className="mb-6 hidden lg:block">
                <BookingAgenda rows={agendaRows} selectedDateKey={selectedDateKey} pickedKeys={selectedKeys} onPick={pickFromAgenda} />
              </div>
            )}
            {extraPayment && (
              <div className="glass-surface-elevated mt-6 p-5">
                <p className="mb-3 text-small text-slate-400">
                  Extra time for {extraPayment.when}. Credits are for your weekly class, so this one is paid on its own.
                </p>
                <ZelleUnlockGate
                  status={extraPayment.status}
                  rejectionReason={null}
                  scaleCode="Extra class"
                  scaleTitle={extraPayment.when}
                  eyebrowLabel="Pay"
                  amountCents={extraPayment.amountCents}
                  zelleHandle={zelleHandle}
                  paymentId={extraPayment.id}
                  onSubmitPayment={submitClassCreditsPaymentAction.bind(null, extraPayment.id)}
                />
                <button type="button" onClick={() => setExtraPayment(null)} className={buttonVariants({ variant: "secondary", size: "sm", className: "mt-3" })}>
                  Back to times
                </button>
              </div>
            )}

            {mode === "FAMILY" && familyRow && (
              <div className="glass-surface-elevated mt-6 p-5">
                <p className="text-small font-medium text-slate-100">
                  Family booking · {formatOccurrenceDay(familyRow.scheduledAt)} at {formatOccurrenceTime(familyRow.scheduledAt)}
                </p>
                <div className="mt-4 space-y-2">
                  {familyEmails.map((email, i) => (
                    <AttendeeEmailRow
                      key={i}
                      value={email}
                      onChange={(v) => updateFamilyEmail(i, v)}
                      onRemove={() => setFamilyEmails((prev) => prev.filter((_, idx) => idx !== i))}
                      removable={familyEmails.length > familyMinAttendees}
                      status={familyChecks[email.trim().toLowerCase()]}
                    />
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <button type="button" onClick={() => setFamilyEmails((prev) => [...prev, ""])} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                    + Add another student
                  </button>
                  <div className="flex items-center gap-3">
                    <button type="button" onClick={() => setFamilyRowKey(null)} disabled={familySubmitting} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleBookFamily}
                      disabled={!familyAllVerified || familySubmitting}
                      className={buttonVariants({ variant: "primary", size: "sm", className: "flex shrink-0" })}
                    >
                      {familySubmitting && <MorphingSquare size={12} className="mr-1.5 shrink-0" />}
                      {familySubmitting ? "Booking…" : `Book for ${familyEmailsTrimmed.length || familyMinAttendees} students`}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* The day's times show as soon as a day is tapped: two to a row for plain pick-a-time cards, one per row for cards that carry their own button (family, moving a class, a second class in a week). */}
            <div ref={timesRef} className="mt-6 scroll-mt-20">
              {selectedDateKey && (
                <p className="mb-3 text-body font-semibold text-slate-100">
                  {new Date(selectedDateKey).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" })}
                </p>
              )}
              {!selectedDateKey ? null : displayRows.length === 0 ? (
                <p className="text-small text-slate-500">No open times on that day.</p>
              ) : (
                <div className={`grid gap-2 sm:gap-3 ${mode === "SOLO" && !reschedulingBooking && !weeklyLimited ? "grid-cols-2" : "grid-cols-1"}`}>
                  {occurrenceGroups.flatMap((group) => group.rows).map((row) => {
                    const key = rowKey(row);
                    const cost = creditsFor(row);
                    const isSelected = selectedKeys.has(key);
                    const weekStart = weekStartMs(row.occurrenceDateMs);
                    const isCurrentRescheduleSlot = reschedulingBooking !== null && row.scheduledAt === reschedulingBooking.scheduledAt;
                    // The credits the class being moved holds are freed by the same move.
                    const effectiveCredits = reschedulingBooking ? credits + reschedulingBooking.creditsSpent : credits;

                    const card = (children: React.ReactNode, onClick?: () => void, extra = "") => (
                      <button
                        key={key}
                        type="button"
                        onClick={onClick}
                        disabled={!onClick}
                        aria-pressed={onClick ? isSelected : undefined}
                        className={`tap flex min-h-14 w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left sm:gap-3 sm:px-4 sm:py-3 transition disabled:cursor-not-allowed bg-neu-base ${
                          isSelected ? "shadow-pressed-low ring-1 ring-signal/50" : "shadow-raised-low hover:shadow-raised-mid"
                        } ${extra}`}
                      >
                        {children}
                      </button>
                    );
                    const time = (
                      <span className="min-w-0">
                        <span className="block text-body font-semibold text-slate-50">{formatOccurrenceTime(row.scheduledAt)}</span>
                        <span className="block text-small text-slate-500">
                          to {formatEndTime(row.scheduledAt, cost)}
                          {cost !== CREDITS_PER_CLASS && ` · ${creditsLabel(cost)}`}
                        </span>
                        {row.reservedForYou && !row.isBooked && (
                          <span className="mt-1 inline-block whitespace-nowrap rounded-full bg-signal/15 px-2 py-0.5 text-small font-medium text-signal-fg">Reserved for you</span>
                        )}
                      </span>
                    );

                    if (row.isBooked) {
                      return card(
                        <>
                          {time}
                          <span className="shrink-0 text-small font-medium text-slate-500">{isCurrentRescheduleSlot ? "Your time" : "Taken"}</span>
                        </>,
                        undefined,
                        "opacity-60",
                      );
                    }

                    if (reschedulingBooking) {
                      const tooPricey = effectiveCredits < cost;
                      return (
                        <div key={key} className="flex items-center justify-between gap-3 rounded-xl bg-neu-base px-4 py-3 shadow-raised-low">
                          {time}
                          <button
                            type="button"
                            onClick={() => handleReschedule(row)}
                            disabled={tooPricey || reschedulingKey !== null}
                            className={`${actionClass} shrink-0`}
                          >
                            {reschedulingKey === key && <MorphingSquare size={12} className="mr-1.5 shrink-0" />}
                            {reschedulingKey === key ? "Moving…" : tooPricey ? "Not enough credits" : "Move here"}
                          </button>
                        </div>
                      );
                    }

                    if (mode === "FAMILY") {
                      return (
                        <div key={key} className="flex items-center justify-between gap-3 rounded-xl bg-neu-base px-4 py-3 shadow-raised-low">
                          <span className="min-w-0">
                            <span className="block text-body font-semibold text-slate-50">{formatOccurrenceTime(row.scheduledAt)}</span>
                            <span className="block text-small text-slate-500">
                              to {formatEndTime(row.scheduledAt, familyCreditsPerStudent)} · {creditsLabel(familyCreditsPerStudent)} each
                            </span>
                          </span>
                          <button type="button" onClick={() => openFamilyBooking(row)} disabled={familySubmitting} className={`${actionClass} shrink-0`}>
                            Set up
                          </button>
                        </div>
                      );
                    }

                    // A subscriber's week already has its class: more time is paid, not credits.
                    if (weeklyLimited && heldWeeks.has(weekStart)) {
                      return (
                        <div key={key} className="flex items-center justify-between gap-3 rounded-xl bg-neu-base px-4 py-3 shadow-raised-low">
                          {time}
                          <button type="button" onClick={() => startExtraPayment(row)} disabled={payBusyKey !== null} className={actionClass}>
                            {payBusyKey === key && <MorphingSquare size={12} className="mr-1.5 shrink-0" />}
                            Buy extra · ${(extraClassCents / 100).toFixed(0)}
                          </button>
                        </div>
                      );
                    }
                    if (weeklyLimited && pickedWeeks.has(weekStart) && !isSelected) {
                      return card(
                        <>
                          {time}
                          <span className="shrink-0 text-right text-small text-slate-500">One class a week</span>
                        </>,
                        undefined,
                        "opacity-60",
                      );
                    }

                    return card(
                      <>
                        {time}
                        <span className="flex shrink-0 items-center gap-2">
                          {!isSelected && <span className="hidden text-small font-medium text-signal-fg sm:inline">Open</span>}
                          <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${isSelected ? "bg-signal text-black" : "bg-ink/10 text-transparent"}`}>
                            <CheckIcon size={12} />
                          </span>
                        </span>
                      </>,
                      () => toggleSelected(row),
                    );
                  })}
                </div>
              )}
            </div>

              </div>
            </div>

            {/* The total, once anything is picked. Sticks to the bottom so it is always in reach. */}
            {bookingBarVisible && (
              <div
                className="glass-surface-elevated sticky bottom-2 z-20 mt-6 flex flex-wrap items-center justify-between gap-4 p-4 lg:bottom-4"
                role="region"
                aria-label="Your selection"
              >
                <div>
                  <p className="text-small font-medium text-slate-100">
                    {selectedRows.length} class{selectedRows.length === 1 ? "" : "es"} · <span className="tabular-nums">{creditsLabel(selectedCreditTotal)}</span>
                  </p>
                  <p className={`mt-0.5 text-small ${missingCredits > 0 ? "text-red-400" : "text-slate-500"}`}>
                    {missingCredits > 0
                      ? `You have ${creditsLabel(credits)}, so you need ${creditsLabel(missingCredits)} more.`
                      : `You have ${creditsLabel(credits)}. ${creditsLabel(credits - selectedCreditTotal)} left after this.`}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => setSelectedKeys(new Set())} disabled={bundleSubmitting} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                    Clear
                  </button>
                  {missingCredits > 0 ? (
                    <Link href="/billing/plans" className={buttonVariants({ variant: "primary", size: "sm", className: "flex shrink-0" })}>
                      Get more credits
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={handleBookSelected}
                      disabled={bundleSubmitting}
                      className={buttonVariants({ variant: "primary", size: "sm", className: "flex shrink-0" })}
                    >
                      {bundleSubmitting && <MorphingSquare size={12} className="mr-1.5 shrink-0" />}
                      {bundleSubmitting ? "Booking…" : `Book ${selectedRows.length} class${selectedRows.length === 1 ? "" : "es"}`}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "upcoming" && (
          <div className="max-w-3xl">
            {upcoming.length === 0 ? (
              <p className="text-small text-slate-500">No upcoming classes. Pick a time under Book.</p>
            ) : (
              <div className="space-y-3">
                {upcoming.map((b) => (
                  <BookingCard
                    key={b.id}
                    booking={b}
                    cancellationCutoffHours={cancellationCutoffHours}
                    canCancel={canCancel}
                    canReschedule={canReschedule}
                    cancelingId={cancelingId}
                    reschedulingBookingId={reschedulingBooking?.id ?? null}
                    onCancel={handleCancel}
                    onStartReschedule={startReschedule}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "past" && (
          <div className="max-w-3xl">
            {historyGroups.length === 0 ? (
              <p className="text-small text-slate-500">No past classes yet.</p>
            ) : (
              <div className="space-y-2">
                {historyGroups.map((group, i) => (
                  <MonthGroup
                    key={group.key}
                    group={group}
                    defaultOpen={i === 0}
                    cancellationCutoffHours={cancellationCutoffHours}
                    canCancel={canCancel}
                    canReschedule={canReschedule}
                    cancelingId={cancelingId}
                    reschedulingBookingId={reschedulingBooking?.id ?? null}
                    onCancel={handleCancel}
                    onStartReschedule={startReschedule}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      </div>
    </WideLayout>
  );
}

