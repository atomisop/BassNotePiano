"use client";

import { useViewerClockReady, viewerLocale } from "@/lib/viewerClock";
import { scrollWithin } from "@/lib/scrollWithin";
import { useEffect, useMemo, useRef, useState } from "react";
import { newIdempotencyKey } from "@/lib/idempotencyClient";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { bookClassBundleAction, bookFamilyClassAction, checkFamilyClassAttendeesAction, cancelClassBookingAction, rescheduleClassBookingAction, requestClassTimesAction, cancelBookingRequestAction } from "./actions";
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
import { NextClassBand } from "@/components/lessons/NextClassBand";
import { Tabs } from "@/components/ui/Tabs";
import { MessageSupportButton } from "@/components/lessons/MessageSupportButton";
import { buttonVariants } from "@/components/ui/button";
import { announceChange } from "@/lib/liveEvents";
import { NETWORK_ERROR, type OccurrenceRow, type BookingRow, type BookingMode, type TabId, formatOccurrenceDay, creditsLabel, weekStartMs, formatOccurrenceTime, groupOccurrencesByWeek, groupByMonth, BookingCard, MonthGroup, AttendeeEmailRow } from "./BookingParts";
import { MaskReveal } from "@/components/ui/MaskReveal";
import { SuccessPulse } from "@/components/ui/SuccessPulse";
import { slotKey, startPlanWithTimePath } from "@/lib/inPlaceLinks";
import { Meta } from "@/components/ui/CardKit";
import { JoinClassButton } from "@/components/lessons/JoinClassButton";
import { DISCORD_INVITE_URL } from "@/lib/discord";
import { seatsLeftNote } from "@/lib/seatRules";

/** A request the student sent (request mode), as the booking screen shows it. */
export interface MyRequestRow {
  id: string;
  label: string | null;
  scheduledAt: string;
  status: "PENDING" | "CONFIRMED" | "DECLINED" | "CANCELED";
  ahead: number;
}

/** Hours that already have requests waiting. Never says who. */
export interface RequestHintRow {
  scheduleId: string;
  scheduledAtMs: number;
  count: number;
  mine: boolean;
}

export function ClassBookingClient({
  requestMode = false,
  myRequests = [],
  requestHints = [],
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
  heading = "Book an extra class",
  startPlanWithTime = false,
  weeklyLimited = false,
  fifthClassOffer = null,
  extraClassCents = EXTRA_CLASS_PRICE_CENTS,
}: {
  /** The section's heading in extra mode ("Book a class" for a group member who books every class themselves). */
  heading?: string;
  /** No plan yet: short on credits offers starting a plan with the time just picked, instead of a bare plans page. */
  startPlanWithTime?: boolean;
  /** Settings > Booking > "Students request times": picking times sends a request the teacher confirms. */
  requestMode?: boolean;
  myRequests?: MyRequestRow[];
  requestHints?: RequestHintRow[];
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
  useViewerClockReady(); // redraws once when the viewer's own clock and language take over (see viewerClock.ts)
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
  // The message stays on screen while its wipe plays out after `success` is cleared.
  const lastSuccess = useRef("");
  if (success) lastSuccess.current = success;
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
    () => rows.map((r) => ({ key: rowKey(r), occurrenceDateMs: r.occurrenceDateMs, scheduledAt: r.scheduledAt, durationMin: r.durationMin, isBooked: r.isBooked, seats: r.seats, seatsLeft: r.seatsLeft, reservedForYou: r.reservedForYou })),
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

    // Request mode: nothing is booked or charged. The times go to the teacher, who confirms them.
    if (requestMode) {
      try {
        const sent = await requestClassTimesAction(picked.map((r) => ({ scheduleId: r.scheduleId, occurrenceDateMs: r.occurrenceDateMs, chunkIndex: r.chunkIndex })));
        announceChange("page");
        if (!sent.ok) {
          setError(sent.error);
          return;
        }
        const okKeys = new Set(sent.results.filter((r) => r.ok).map((r) => `${r.scheduleId}:${r.occurrenceDateMs}:${r.chunkIndex}`));
        const failed = sent.results.filter((r) => !r.ok);
        setSelectedKeys(new Set(picked.filter((r) => !okKeys.has(rowKey(r))).map(rowKey)));
        if (okKeys.size > 0) setSuccess(`Request sent for ${okKeys.size} time${okKeys.size === 1 ? "" : "s"}. We will tell you as soon as ${okKeys.size === 1 ? "it is" : "they are"} confirmed. See Upcoming.`);
        if (failed.length > 0) setError(`${failed[0]!.error ?? "One time could not be requested."}${okKeys.size > 0 ? ` (${okKeys.size} of ${sent.results.length} sent.)` : ""}`);
      } catch {
        setError(NETWORK_ERROR);
      } finally {
        setBundleSubmitting(false);
      }
      return;
    }

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

  const [cancelingRequestId, setCancelingRequestId] = useState<string | null>(null);
  async function handleCancelRequest(id: string) {
    setError(null);
    setCancelingRequestId(id);
    try {
      const result = await cancelBookingRequestAction(id);
      announceChange("page");
      if (!result.ok) setError(result.error);
    } catch {
      setError(NETWORK_ERROR);
    } finally {
      setCancelingRequestId(null);
    }
  }
  const hintFor = (row: OccurrenceRow) => requestHints.find((h) => h.scheduleId === row.scheduleId && h.scheduledAtMs === new Date(row.scheduledAt).getTime()) ?? null;
  const pendingRequests = myRequests.filter((r) => r.status === "PENDING");

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

  const nextClass = upcoming[0] ?? null;
  const nextHours = nextClass ? (new Date(nextClass.scheduledAt).getTime() - Date.now()) / 3_600_000 : null;
  const nextClassJoinable = nextClass !== null && nextHours !== null && nextHours <= 0.5 && nextHours > -1 && !nextClass.inPerson;

  const actionClass =
    "tap flex min-h-9 shrink-0 items-center justify-center rounded-full px-4 py-2 text-small font-semibold transition disabled:cursor-not-allowed disabled:text-slate-500 bg-neu-base shadow-raised-low hover:shadow-raised-mid active:shadow-pressed-low text-slate-50";
  const bookingBarVisible = tab === "book" && mode === "SOLO" && !reschedulingBooking && selectedKeys.size > 0 && !extraPayment;

  return (
    <WideLayout>
      {/* One column on phones and tablets. From lg up the Book tab uses the width: times on the left, the calendar on the right. */}
      <div className="mx-auto w-full max-w-2xl lg:max-w-6xl">
      {/* The page's own title ("Lessons") sits above this on the page; this names the section. */}
      {/* The Book tab already says it; only the extra-class mode needs its own heading. */}
      {extraMode && <h2 className="text-title font-semibold text-balance text-slate-50">{heading}</h2>}
      {/* Without a plan this is the whole Lessons screen, so its hero is the next class: the day and time big, the rest quiet. (On a
          plan the weekly tab carries that hero, and this is the quieter extra-sessions tab.) */}
      {!extraMode && nextClass && (
        <NextClassBand
          className="mb-(--space-group)"
          day={formatOccurrenceDay(nextClass.scheduledAt)}
          time={formatOccurrenceTime(nextClass.scheduledAt)}
          meta={
            <Meta
              items={[
                nextClass.label ?? "Class",
                `to ${formatEndTime(nextClass.scheduledAt, nextClass.creditsSpent)}`,
                nextClass.inPerson && "In person",
                upcoming.length > 1 && `${upcoming.length - 1} more booked`,
              ]}
            />
          }
        >
          <div className="flex items-center justify-end gap-2 pt-3">
            <button type="button" onClick={() => setTab("upcoming")} className={buttonVariants({ variant: "ghost", size: "sm" })}>
              See all
            </button>
            {nextClassJoinable && (
              <JoinClassButton href={nextClass.discordUrl ?? DISCORD_INVITE_URL} bookingId={nextClass.id} className={buttonVariants({ variant: "primary", size: "sm" })} />
            )}
          </div>
        </NextClassBand>
      )}

      <div className={extraMode ? "mt-(--space-group)" : ""}>
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
            { id: "upcoming", label: "Upcoming", count: upcoming.length + pendingRequests.length || undefined },
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
        <MaskReveal show={!!success} from="top">
          <SuccessPulse pulseKey={success ?? ""}>
            <p className="mb-4 text-small text-slate-50" role="status">{lastSuccess.current}</p>
          </SuccessPulse>
        </MaskReveal>

        {tab === "book" && (
          <div className="tab-in min-w-0">
            {fifthClassOffer && !extraPayment && (
              <div className="glass-surface mt-4 flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="text-body font-semibold text-slate-50">
                    Fifth class: {formatOccurrenceDay(fifthClassOffer.scheduledAt)}, {formatOccurrenceTime(fifthClassOffer.scheduledAt)}
                  </p>
                  <p className="text-small text-slate-500">
                    Optional, outside your plan.
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
              {!requestMode && (
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
              )}
              <p
                className="flex items-center gap-2 rounded-full bg-neu-base px-3.5 py-2 text-small font-semibold tabular-nums text-slate-50 shadow-pressed-low"
                aria-label={`${formatCredits(storedToCredits(credits))} credits to spend`}
              >
                <Ticket aria-hidden className="h-4 w-4 text-signal-fg" strokeWidth={1.75} />
                {formatCredits(storedToCredits(credits))} {storedToCredits(credits) === 1 ? "credit" : "credits"}
              </p>
            </div>

            {reschedulingBooking && (
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-control bg-signal/10 px-4 py-3 ring-1 ring-inset ring-signal/25">
                <p className="min-w-0 text-small text-slate-300">
                  Moving <span className="font-semibold text-slate-50">{formatDateTime(reschedulingBooking.scheduledAt)}</span>
                  {reschedulingBooking.label && <span className="text-slate-400"> · {reschedulingBooking.label}</span>}
                  {reschedulingBooking.reserved && <span className="text-slate-500"> (this week only)</span>}
                  <span className="block text-caption text-slate-400">Pick its new time below.</span>
                </p>
                <button type="button" onClick={() => setReschedulingBooking(null)} className={buttonVariants({ variant: "ghost", size: "sm", className: "shrink-0" })}>
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
              <p className="text-small text-slate-500">Nothing open</p>
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
              <div className="lgx-card hidden rounded-card p-4 lg:block">
                <div className="flex items-center justify-between">
                  <p className="text-small font-semibold uppercase tracking-caps text-slate-400">Upcoming</p>
                  <button type="button" onClick={() => setTab("upcoming")} className="tap inline-flex items-center text-small font-medium text-slate-400 hover:text-slate-100">
                    See all
                  </button>
                </div>
                <ul className="mt-1 divide-y divide-slate-50/8">
                  {upcoming.slice(0, 3).map((b) => (
                    <li key={b.id} className="py-2.5">
                      <p className="text-small font-semibold tabular-nums text-slate-50">{formatDateTime(b.scheduledAt)}</p>
                      {b.label && <p className="text-caption text-slate-500">{b.label}</p>}
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
                  Extra class · {extraPayment.when}
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
                <p className="mb-3 text-title font-semibold text-slate-50">
                  {new Date(selectedDateKey).toLocaleDateString(viewerLocale(), { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" })}
                </p>
              )}
              {!selectedDateKey ? null : displayRows.length === 0 ? (
                <p className="text-small text-slate-500">No times</p>
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
                        data-glass-tone={onClick && isSelected ? "primary" : undefined}
                        className={`tap flex min-h-14 w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left sm:gap-3 sm:px-4 sm:py-3 transition disabled:cursor-not-allowed ${
                          !onClick ? "bg-slate-50/3" : "lgx-btn"
                        } ${extra}`}
                      >
                        {children}
                      </button>
                    );
                    const time = (
                      <span className="min-w-0">
                        <span className="block text-body font-semibold text-slate-50">{formatOccurrenceTime(row.scheduledAt)}</span>
                        <span className="block text-caption text-slate-500">
                          to {formatEndTime(row.scheduledAt, cost)}
                          {cost !== CREDITS_PER_CLASS && ` · ${creditsLabel(cost)}`}
                        </span>
                        {row.reservedForYou && !row.isBooked && (
                          <span className="mt-0.5 block whitespace-nowrap text-caption font-medium text-signal-fg">Reserved for you</span>
                        )}
                        {!row.isBooked && seatsLeftNote(row.seats ?? 1, row.seatsLeft) && (
                          <span className="block text-caption text-slate-500">{seatsLeftNote(row.seats ?? 1, row.seatsLeft)}</span>
                        )}
                      </span>
                    );

                    if (row.isBooked) {
                      return card(
                        <>
                          {time}
                          <span className="shrink-0 text-small text-slate-500">{isCurrentRescheduleSlot ? "Your time" : row.heldByPlan ? "Reserved" : "Taken"}</span>
                        </>,
                        undefined,
                        "opacity-50",
                      );
                    }

                    if (reschedulingBooking) {
                      const tooPricey = effectiveCredits < cost;
                      return (
                        <div key={key} className="lgx-row flex items-center justify-between gap-3 rounded-xl px-4 py-3">
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
                        <div key={key} className="lgx-row flex items-center justify-between gap-3 rounded-xl px-4 py-3">
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
                        <div key={key} className="lgx-row flex items-center justify-between gap-3 rounded-xl px-4 py-3">
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
                          <span className="shrink-0 text-right text-small text-slate-500">Weekly limit</span>
                        </>,
                        undefined,
                        "opacity-60",
                      );
                    }

                    const hint = requestMode ? hintFor(row) : null;
                    if (hint?.mine) {
                      return card(
                        <>
                          {time}
                          <span className="shrink-0 text-small font-medium text-amber-300">You asked</span>
                        </>,
                        undefined,
                        "opacity-70",
                      );
                    }

                    return card(
                      <>
                        {time}
                        <span className="flex shrink-0 items-center gap-2">
                          {!isSelected && (hint && hint.count > 0 ? <span className="text-small font-medium text-amber-300">Requested</span> : <span className="hidden text-small text-slate-500 sm:inline">Open</span>)}
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
                  <p className="text-body font-semibold text-slate-50">
                    {selectedRows.length} class{selectedRows.length === 1 ? "" : "es"} <span className="text-small font-normal tabular-nums text-slate-400">· {creditsLabel(selectedCreditTotal)}</span>
                  </p>
                  <p className={`mt-0.5 text-small ${missingCredits > 0 ? "text-red-400" : "text-slate-500"}`}>
                    {missingCredits > 0
                      ? `You have ${creditsLabel(credits)}, so you need ${creditsLabel(missingCredits)} more.`
                      : requestMode
                        ? `You have ${creditsLabel(credits)}. Nothing is booked or charged until we confirm.`
                        : `You have ${creditsLabel(credits)}. ${creditsLabel(credits - selectedCreditTotal)} left after this.`}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => setSelectedKeys(new Set())} disabled={bundleSubmitting} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                    Clear
                  </button>
                  {missingCredits > 0 ? (
                    startPlanWithTime && selectedRows[0] ? (
                      // No plan yet: start one with the time just picked as the weekly time, instead of picking it again.
                      <Link
                        href={startPlanWithTimePath(slotKey(selectedRows[0].scheduleId, selectedRows[0].chunkIndex))}
                        className={buttonVariants({ variant: "primary", size: "sm", className: "flex shrink-0" })}
                      >
                        Start a plan with this time
                      </Link>
                    ) : (
                      <Link href="/billing/plans" className={buttonVariants({ variant: "primary", size: "sm", className: "flex shrink-0" })}>
                        Get more credits
                      </Link>
                    )
                  ) : (
                    <button
                      type="button"
                      onClick={handleBookSelected}
                      disabled={bundleSubmitting}
                      className={buttonVariants({ variant: "primary", size: "sm", className: "flex shrink-0" })}
                    >
                      {bundleSubmitting && <MorphingSquare size={12} className="mr-1.5 shrink-0" />}
                      {bundleSubmitting ? (requestMode ? "Sending…" : "Booking…") : requestMode ? `Request ${selectedRows.length} time${selectedRows.length === 1 ? "" : "s"}` : `Book ${selectedRows.length} class${selectedRows.length === 1 ? "" : "es"}`}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "upcoming" && (
          <div className="tab-in max-w-3xl">
            {myRequests.length > 0 && (
              <div className="mb-6">
                <p className="mb-2 px-1 text-small font-semibold uppercase tracking-caps text-slate-400">Your requests</p>
                <ul className="lgx-card divide-y divide-slate-50/8 rounded-card px-4 sm:px-5">
                  {myRequests.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className="text-body font-semibold tabular-nums text-slate-50">{formatDateTime(r.scheduledAt)}</p>
                        <p className="text-small text-slate-500">
                          {r.status === "PENDING"
                            ? r.ahead === 0
                              ? "Waiting for us. You are first in line."
                              : `Waiting for us. ${r.ahead} ${r.ahead === 1 ? "person" : "people"} asked first.`
                            : r.status === "CONFIRMED"
                              ? "Confirmed. It is in your classes below."
                              : "Not available. Pick another time."}
                        </p>
                      </div>
                      {r.status === "PENDING" && (
                        <button type="button" onClick={() => handleCancelRequest(r.id)} disabled={cancelingRequestId === r.id} className={buttonVariants({ variant: "ghost", size: "sm", className: "shrink-0 text-red-300 hover:text-red-200" })}>
                          {cancelingRequestId === r.id ? "Canceling…" : "Cancel"}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {upcoming.length === 0 ? (
              <p className="text-small text-slate-500">Nothing booked</p>
            ) : (
              <div className="lgx-card divide-y divide-slate-50/8 rounded-card px-4 sm:px-5">
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
          <div className="tab-in max-w-3xl">
            {historyGroups.length === 0 ? (
              <p className="text-small text-slate-500">None yet</p>
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

