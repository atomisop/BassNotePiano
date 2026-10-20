"use client";

import { Collapse } from "@/components/ui/Collapse";
import { scrollWithin } from "@/lib/scrollWithin";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  bookClassAction,
  bookClassBundleAction,
  bookFamilyClassAction,
  checkFamilyClassAttendeesAction,
  cancelClassBookingAction,
  rescheduleClassBookingAction,
} from "./actions";
import { BookingCalendar, dayKey } from "./BookingCalendar";
import { formatDateTime, formatEndTime } from "@/lib/classScheduleLabels";
import { CheckIcon, XIcon } from "@/components/ui/icons";
import { CLASS_MINUTES, CREDITS_PER_CLASS, EXTRA_CLASS_PRICE_CENTS, creditsLabelFromStored, formatCredits, storedToCredits } from "@/lib/classCreditPricing";
import { errorNeedsTeam, weekRangeForOccurrence } from "@/lib/bookingRules";
import { ZelleUnlockGate } from "@/components/billing/ZelleUnlockGate";
import { createExtraClassPaymentAction, submitClassCreditsPaymentAction } from "../billing/lessons/actions";
import type { ZellePaymentStatus } from "@prisma/client";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { DISCORD_INVITE_URL } from "@/lib/discord";
import { WideLayout } from "@/components/layout/PageLayouts";
import { Tabs } from "@/components/ui/Tabs";
import { MessageSupportButton } from "@/components/lessons/MessageSupportButton";
import { buttonVariants } from "@/components/ui/button";
import { DiscordLink } from "@/components/ui/DiscordLink";
import { announceChange } from "@/lib/liveEvents";

const NETWORK_ERROR = "That didn't go through. Check your connection and try again.";

interface OccurrenceRow {
  scheduleId: string;
  label: string | null;
  dayOfWeek: number;
  chunkIndex: number;
  durationMin: number;
  creditCost: number;
  occurrenceDateMs: number;
  scheduledAt: string;
  isBooked: boolean;
}

interface BookingRow {
  id: string;
  /** The ET calendar day of the class, as UTC midnight. Decides which week it counts toward. */
  occurrenceDateMs?: number;
  label: string | null;
  scheduledAt: string;
  creditsSpent: number;
  status: "SCHEDULED" | "CANCELED" | "COMPLETED";
  refunded: boolean;
  attendance: "PRESENT" | "NO_SHOW" | null;
  canceledReason: string | null;
  /** Booked by the student's payment plan (their weekly class). Moving it changes this week only. */
  reserved?: boolean;
  /** The private Discord call for this class, once it exists. */
  discordUrl?: string | null;
}

type BookingMode = "SOLO" | "FAMILY";
type TabId = "book" | "upcoming" | "past";

const STATUS_LABEL: Record<BookingRow["status"], string> = {
  SCHEDULED: "Scheduled",
  COMPLETED: "Completed",
  CANCELED: "Canceled",
};

const STATUS_STYLE: Record<BookingRow["status"], string> = {
  SCHEDULED: "text-slate-50 bg-neu-base shadow-raised-low",
  COMPLETED: "bg-[rgb(var(--c-s-50)/0.08)] text-slate-200",
  CANCELED: "bg-neu-base shadow-pressed-low text-slate-500",
};

/** Weekday + date only, the time is shown separately as its own column. */
function formatOccurrenceDay(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

/** Length of a booking that spent `credits`: a class is CLASS_MINUTES. */
function lengthLabel(credits: number) {
  return `${Math.round((credits / CREDITS_PER_CLASS) * CLASS_MINUTES)} min`;
}

/** Whole classes behind a credit amount. */
function classCount(credits: number) {
  return Math.floor(credits / CREDITS_PER_CLASS);
}
const classWord = (n: number) => `class${n === 1 ? "" : "es"}`;
/** A stored amount as people count it: one credit is one class (45 minutes). */
const creditsLabel = (n: number) => creditsLabelFromStored(n);
const weekStartMs = (occurrenceDateMs: number) => weekRangeForOccurrence(new Date(occurrenceDateMs)).start.getTime();

function formatOccurrenceTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/**
 * Buckets upcoming occurrences into "This week" / "Next week" / "Later".
 * A flat list of near-identical rows gave the reader nothing to navigate
 * by; a week boundary is the unit people actually plan in.
 */
function groupOccurrencesByWeek(rows: OccurrenceRow[]): { key: string; label: string; rows: OccurrenceRow[] }[] {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const WEEK = 7 * 24 * 60 * 60 * 1000;

  const buckets: Record<string, OccurrenceRow[]> = { this: [], next: [], later: [] };
  for (const row of rows) {
    const delta = new Date(row.scheduledAt).getTime() - startOfToday;
    if (delta < WEEK) buckets.this.push(row);
    else if (delta < WEEK * 2) buckets.next.push(row);
    else buckets.later.push(row);
  }

  return [
    { key: "this", label: "This week", rows: buckets.this },
    { key: "next", label: "Next week", rows: buckets.next },
    { key: "later", label: "Later", rows: buckets.later },
  ].filter((g) => g.rows.length > 0);
}

function monthKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

/** Groups already-desc-sorted bookings into consecutive per-month buckets, preserving order. */
function groupByMonth(list: BookingRow[]): { key: string; label: string; bookings: BookingRow[] }[] {
  const groups: { key: string; label: string; bookings: BookingRow[] }[] = [];
  for (const b of list) {
    const key = monthKey(b.scheduledAt);
    const last = groups[groups.length - 1];
    if (last?.key === key) {
      last.bookings.push(b);
    } else {
      groups.push({ key, label: monthLabel(b.scheduledAt), bookings: [b] });
    }
  }
  return groups;
}

function BookingCard({
  booking,
  cancellationCutoffHours,
  canCancel,
  canReschedule,
  cancelingId,
  reschedulingBookingId,
  onCancel,
  onStartReschedule,
}: {
  booking: BookingRow;
  cancellationCutoffHours: number;
  canCancel: boolean;
  canReschedule: boolean;
  cancelingId: string | null;
  reschedulingBookingId: string | null;
  onCancel: (booking: BookingRow) => void;
  onStartReschedule: (booking: BookingRow) => void;
}) {
  const b = booking;
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const start = new Date(b.scheduledAt);
  const hoursUntil = (start.getTime() - Date.now()) / 3_600_000;
  // Self-cancel and self-reschedule share one rule (see cancelClassBooking and
  // rescheduleClassBooking): free to change until the cutoff, then it goes
  // through the team.
  const scheduled = b.status === "SCHEDULED";
  const changeEligible = scheduled && hoursUntil >= cancellationCutoffHours;
  // The owner can switch self-cancel and self-reschedule off (Settings → Cancel and reschedule).
  const cancelEligible = changeEligible && canCancel;
  const rescheduleEligible = changeEligible && canReschedule;
  const insideWindow = scheduled && hoursUntil > 0 && hoursUntil < cancellationCutoffHours;
  const isBeingRescheduled = reschedulingBookingId === b.id;
  const canceling = cancelingId === b.id;
  const freeUntil = new Date(start.getTime() - cancellationCutoffHours * 3_600_000);
  const minutes = Math.round((b.creditsSpent / CREDITS_PER_CLASS) * CLASS_MINUTES);

  return (
    <div className="glass-surface p-4 sm:p-5">
      <div className="flex items-start gap-4">
        <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-xl bg-neu-base shadow-pressed-low">
          <span className="text-small font-medium uppercase tracking-wide text-slate-500">
            {start.toLocaleDateString(undefined, { weekday: "short" })}
          </span>
          <span className="text-xl font-bold leading-none text-slate-50">{start.getDate()}</span>
          <span className="text-small text-slate-500">{start.toLocaleDateString(undefined, { month: "short" })}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="text-body font-semibold text-slate-50">{b.label ?? "Class"}</p>
            {b.reserved && scheduled && (
              <span className="rounded-full bg-neu-base px-2 py-0.5 text-small text-slate-400 shadow-raised-low">Your weekly class</span>
            )}
            {!scheduled && (
              <span className={`rounded-full px-2.5 py-0.5 text-small font-medium uppercase tracking-wide ${STATUS_STYLE[b.status]}`}>
                {STATUS_LABEL[b.status]}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-small text-slate-200">
            {start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })} to {formatEndTime(b.scheduledAt, b.creditsSpent)}
          </p>
          <p className="mt-0.5 text-small text-slate-500">
            {creditsLabel(b.creditsSpent)} · {minutes} min
          </p>
          {changeEligible && (
            <p className="mt-1 text-small text-slate-500">
              Free to change until {freeUntil.toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}
            </p>
          )}
          {insideWindow && (
            <p className="mt-1 text-small text-slate-500">
              Starts within {cancellationCutoffHours} hours, so changes now go through the team. Message support and they will sort it out.
            </p>
          )}
          {b.status === "COMPLETED" && b.attendance && (
            <p className={`mt-1 text-small ${b.attendance === "PRESENT" ? "text-slate-50" : "text-red-400"}`}>
              {b.attendance === "PRESENT" ? "Attended" : "Marked no-show, still charged"}
            </p>
          )}
        </div>
      </div>

      {scheduled && hoursUntil > -1 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {hoursUntil <= 0.5 && (
            <DiscordLink
              href={b.discordUrl ?? DISCORD_INVITE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ variant: "primary", size: "sm" })}
            >
              Join on Discord
            </DiscordLink>
          )}
          {rescheduleEligible && (
            <button
              type="button"
              onClick={() => onStartReschedule(b)}
              disabled={canceling}
              className={`tap flex items-center justify-center rounded-lg px-3 py-1.5 text-small font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${
                isBeingRescheduled
                  ? "bg-[rgb(var(--c-s-50)/0.1)] text-[rgb(var(--c-s-50))] shadow-pressed-low"
                  : "bg-neu-base text-slate-100 shadow-raised-low hover:shadow-raised-mid active:shadow-pressed-low"
              }`}
            >
              {isBeingRescheduled ? "Picking new time…" : b.reserved ? "Move this week" : "Reschedule"}
            </button>
          )}
          {cancelEligible && !confirmingCancel && (
            <button
              type="button"
              onClick={() => setConfirmingCancel(true)}
              disabled={canceling}
              className={buttonVariants({ variant: "secondary", size: "sm" })}
            >
              {b.reserved ? "Skip" : "Cancel"}
            </button>
          )}
          {hoursUntil > 0 && (
            <a
              href={`/api/calendar/class?s=${encodeURIComponent(b.scheduledAt)}&m=${minutes}`}
              className={buttonVariants({ variant: "secondary", size: "sm" })}
            >
              Add to calendar
            </a>
          )}
          <MessageSupportButton bookingId={b.id} />
        </div>
      )}

      {cancelEligible && confirmingCancel && (
        <div className="mt-3 rounded-xl bg-neu-base px-4 py-3 shadow-pressed-low">
          <p className="text-small text-slate-300">
            {b.reserved ? "Skip this class? It stays on your account." : "Cancel this class? No credits are used."} The teacher is told right away.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setConfirmingCancel(false)}
              disabled={canceling}
              className={buttonVariants({ variant: "secondary", size: "sm" })}
            >
              Keep it
            </button>
            <button
              type="button"
              onClick={() => onCancel(b)}
              disabled={canceling}
              className={buttonVariants({ variant: "danger", size: "sm" })}
            >
              {canceling && <MorphingSquare size={12} />}
              {canceling ? "Canceling…" : b.reserved ? "Yes, skip it" : "Yes, cancel it"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={`h-4 w-4 shrink-0 text-slate-500 transition-transform duration-(--dur-base) ease-(--ease-ios) ${open ? "rotate-180" : ""}`}
    >
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MonthGroup({
  group,
  defaultOpen,
  cancellationCutoffHours,
  canCancel,
  canReschedule,
  cancelingId,
  reschedulingBookingId,
  onCancel,
  onStartReschedule,
}: {
  group: { key: string; label: string; bookings: BookingRow[] };
  defaultOpen: boolean;
  cancellationCutoffHours: number;
  canCancel: boolean;
  canReschedule: boolean;
  cancelingId: string | null;
  reschedulingBookingId: string | null;
  onCancel: (booking: BookingRow) => void;
  onStartReschedule: (booking: BookingRow) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="glass-surface overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={buttonVariants({ variant: "secondary", size: "sm", className: "w-full justify-between" })}
      >
        <span className="text-small font-medium text-slate-200">{group.label}</span>
        <span className="flex items-center gap-2 text-small text-slate-500">
          {group.bookings.length} booking{group.bookings.length === 1 ? "" : "s"}
          <ChevronIcon open={open} />
        </span>
      </button>
      <Collapse open={open}>
        <div className="space-y-2 border-t border-ink/10 p-3">
          {group.bookings.map((b) => (
            <BookingCard
              key={b.id}
              booking={b}
              cancellationCutoffHours={cancellationCutoffHours}
                    canCancel={canCancel}
                    canReschedule={canReschedule}
              cancelingId={cancelingId}
              reschedulingBookingId={reschedulingBookingId}
              onCancel={onCancel}
              onStartReschedule={onStartReschedule}
            />
          ))}
        </div>
      </Collapse>
    </div>
  );
}

/** One row's email input + live verification badge, used inside the family booking form. */
function AttendeeEmailRow({
  value,
  onChange,
  onRemove,
  removable,
  status,
}: {
  value: string;
  onChange: (value: string) => void;
  onRemove: () => void;
  removable: boolean;
  status?: { checking: boolean; found: boolean; verified: boolean; name: string | null };
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="email"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="student@email.com"
        className="min-w-0 flex-1 glass-surface-subtle px-3 py-2 text-body text-slate-100 outline-none transition focus:border-[rgb(var(--c-s-50)/0.6)]"
      />
      <span className="w-28 shrink-0 text-small">
        {value.trim() === "" ? null : status?.checking ? (
          <span className="text-slate-500">Checking…</span>
        ) : status?.verified ? (
          <span className="flex items-center gap-1 text-slate-50">
            <CheckIcon size={11} />
            {status.name ?? "Verified"}
          </span>
        ) : status?.found ? (
          <span className="text-red-400">Not verified</span>
        ) : status ? (
          <span className="text-red-400">No account found</span>
        ) : null}
      </span>
      {removable && (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove this student"
          className={buttonVariants({ variant: "secondary", size: "sm", className: "flex shrink-0" })}
        >
          <XIcon size={12} />
        </button>
      )}
    </div>
  );
}

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
}: {
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
      result = await cancelClassBookingAction(booking.id);
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
        setError(result.error ?? "Something went wrong. Please try again.");
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

  async function handleBookFamily() {
    if (!familyRow || !familyAllVerified) return;
    setError(null);
    setSuccess(null);
    setFamilySubmitting(true);
    let result: Awaited<ReturnType<typeof bookFamilyClassAction>>;
    try {
      result = await bookFamilyClassAction(familyRow.scheduleId, familyRow.occurrenceDateMs, familyRow.chunkIndex, familyEmailsTrimmed);
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

    setRows((prev) => prev.map((r) => (rowKey(r) === rowKey(familyRow) ? { ...r, isBooked: true } : r)));
    setFamilyRowKey(null);
    setFamilyEmails(["", ""]);
    setFamilyChecks({});
    setSuccess(`Booked for ${familyEmailsTrimmed.length} students, ${creditsLabel(familyCreditsPerStudent)} reserved from each.`);
  }

  const actionClass =
    "tap flex min-h-9 shrink-0 items-center justify-center rounded-lg px-4 py-2 text-small font-semibold transition disabled:cursor-not-allowed disabled:text-slate-600 bg-neu-base shadow-raised-low hover:shadow-raised-mid active:shadow-pressed-low text-[rgb(var(--c-s-50))]";
  const bookingBarVisible = tab === "book" && mode === "SOLO" && !reschedulingBooking && selectedKeys.size > 0 && !extraPayment;

  return (
    <WideLayout>
      <p className="text-small font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50)/0.8)]">
        {extraMode ? "Extra sessions" : "Live Lessons"}
      </p>
      <h1 className="font-hero text-hero font-bold text-balance mt-1.5 text-slate-50">
        {extraMode ? "Book an extra class" : "Book a class"}
      </h1>

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
            {/* Credits: what a class costs and what the student has. No money here. */}
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-xl bg-neu-base px-4 py-3 shadow-pressed-low">
              <p className="text-small text-slate-400">
                Your credits <span className="ml-1 text-body font-semibold tabular-nums text-slate-50">{formatCredits(storedToCredits(credits))}</span>
              </p>
              <p className="text-small text-slate-400">
                Each class costs <span className="font-semibold text-slate-100">{creditsLabel(CREDITS_PER_CLASS)}</span> · {CLASS_MINUTES} min
              </p>
            </div>
            {weeklyLimited && (
              <p className="mt-2 text-small text-slate-500">
                Your plan covers one class a week. A second class in the same week is extra time, paid separately.
              </p>
            )}

            <Tabs
              className="mt-5"
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

            {rows.length > 0 ? (
              <div id="booking-calendar" className="mt-5 scroll-mt-20">
                <p className="mb-3 text-small font-medium text-slate-400">Tap a highlighted day, then pick your times</p>
                <BookingCalendar occurrences={rows} selectedDateKey={selectedDateKey} onSelectDate={setSelectedDateKey} />
              </div>
            ) : (
              <p className="mt-5 text-small text-slate-500">No classes scheduled.</p>
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

            {/* The day's times show as soon as a day is tapped. */}
            <div ref={timesRef} className="mt-6 scroll-mt-20">
              {selectedDateKey && (
                <p className="mb-3 text-body font-semibold text-slate-100">
                  {new Date(selectedDateKey).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" })}
                </p>
              )}
              {!selectedDateKey ? null : displayRows.length === 0 ? (
                <p className="text-small text-slate-500">No open times on that day.</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
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
                        className={`tap flex min-h-14 w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-left transition disabled:cursor-not-allowed bg-neu-base ${
                          isSelected ? "shadow-pressed-low ring-1 ring-[rgb(var(--signal)/0.5)]" : "shadow-raised-low hover:shadow-raised-mid"
                        } ${extra}`}
                      >
                        {children}
                      </button>
                    );
                    const time = (
                      <span className="min-w-0">
                        <span className="block text-body font-semibold text-slate-50">
                          {formatOccurrenceTime(row.scheduledAt)} to {formatEndTime(row.scheduledAt, cost)}
                        </span>
                        <span className="block text-small text-slate-500">{creditsLabel(cost)}</span>
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
                            className={actionClass}
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
                            <span className="block text-body font-semibold text-slate-50">
                              {formatOccurrenceTime(row.scheduledAt)} to {formatEndTime(row.scheduledAt, familyCreditsPerStudent)}
                            </span>
                            <span className="block text-small text-slate-500">{creditsLabel(familyCreditsPerStudent)} per student</span>
                          </span>
                          <button type="button" onClick={() => openFamilyBooking(row)} disabled={familySubmitting} className={actionClass}>
                            Set up family
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
                            Buy extra · ${(EXTRA_CLASS_PRICE_CENTS / 100).toFixed(0)}
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
                          {!isSelected && <span className="text-small font-medium text-signal">Open</span>}
                          <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${isSelected ? "bg-[rgb(var(--signal))] text-black" : "bg-ink/10 text-transparent"}`}>
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
    </WideLayout>
  );
}
