"use client";

import { Collapse } from "@/components/ui/Collapse";
import { useState } from "react";
import { formatEndTime } from "@/lib/classScheduleLabels";
import { CheckIcon, XIcon } from "@/components/ui/icons";
import { CLASS_MINUTES, CREDITS_PER_CLASS, creditsLabelFromStored } from "@/lib/classCreditPricing";
import { weekRangeForOccurrence } from "@/lib/bookingRules";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { DISCORD_INVITE_URL } from "@/lib/discord";
import { InviteToRegisterButton } from "@/components/billing/InviteToRegisterButton";
import { MessageSupportButton } from "@/components/lessons/MessageSupportButton";
import { buttonVariants } from "@/components/ui/button";
import { JoinClassButton } from "@/components/lessons/JoinClassButton";
import { ChevronDown } from "@/components/ui/appIcons";

export const NETWORK_ERROR = "That didn't go through. Check your connection and try again.";

export interface OccurrenceRow {
  scheduleId: string;
  label: string | null;
  dayOfWeek: number;
  chunkIndex: number;
  durationMin: number;
  creditCost: number;
  occurrenceDateMs: number;
  scheduledAt: string;
  isBooked: boolean;
  /** The owner kept this time for this student: open to them, locked for everyone else. */
  reservedForYou?: boolean;
  /** Held by someone's payment plan (not yet an actual booking). Shown as Reserved, not Taken. */
  heldByPlan?: boolean;
}

export interface BookingRow {
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
  /** Taught in person: there is no Discord call. */
  inPerson?: boolean;
}

export type BookingMode = "SOLO" | "FAMILY";
export type TabId = "book" | "upcoming" | "past";

export const STATUS_LABEL: Record<BookingRow["status"], string> = {
  SCHEDULED: "Scheduled",
  COMPLETED: "Completed",
  CANCELED: "Canceled",
};

export const STATUS_STYLE: Record<BookingRow["status"], string> = {
  SCHEDULED: "text-slate-50 bg-neu-base shadow-raised-low",
  COMPLETED: "bg-slate-50/8 text-slate-200",
  CANCELED: "bg-neu-base shadow-pressed-low text-slate-500",
};

/** Weekday + date only, the time is shown separately as its own column. */
export function formatOccurrenceDay(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

/** Length of a booking that spent `credits`: a class is CLASS_MINUTES. */
export function lengthLabel(credits: number) {
  return `${Math.round((credits / CREDITS_PER_CLASS) * CLASS_MINUTES)} min`;
}

/** Whole classes behind a credit amount. */
export function classCount(credits: number) {
  return Math.floor(credits / CREDITS_PER_CLASS);
}
export const classWord = (n: number) => `class${n === 1 ? "" : "es"}`;
/** A stored amount as people count it: one credit is one class (45 minutes). */
export const creditsLabel = (n: number) => creditsLabelFromStored(n);
export const weekStartMs = (occurrenceDateMs: number) => weekRangeForOccurrence(new Date(occurrenceDateMs)).start.getTime();

export function formatOccurrenceTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/**
 * Buckets upcoming occurrences into "This week" / "Next week" / "Later".
 * A flat list of near-identical rows gave the reader nothing to navigate
 * by; a week boundary is the unit people actually plan in.
 */
export function groupOccurrencesByWeek(rows: OccurrenceRow[]): { key: string; label: string; rows: OccurrenceRow[] }[] {
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

export function monthKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

/** Groups already-desc-sorted bookings into consecutive per-month buckets, preserving order. */
export function groupByMonth(list: BookingRow[]): { key: string; label: string; bookings: BookingRow[] }[] {
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

export function BookingCard({
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
          <span className="text-title font-bold leading-none text-slate-50">{start.getDate()}</span>
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
          {b.inPerson && <span className="rounded-full bg-neu-base px-2.5 py-1 text-small font-medium text-slate-200 shadow-raised-low">In person</span>}
          {hoursUntil <= 0.5 && !b.inPerson && (
            <JoinClassButton href={b.discordUrl ?? DISCORD_INVITE_URL} bookingId={b.id} className={buttonVariants({ variant: "primary", size: "sm" })} />
          )}
          {rescheduleEligible && (
            <button
              type="button"
              onClick={() => onStartReschedule(b)}
              disabled={canceling}
              className={`tap flex items-center justify-center rounded-lg px-3 py-1.5 text-small font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${
                isBeingRescheduled
                  ? "bg-slate-50/10 text-slate-50 shadow-pressed-low"
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

export function ChevronIcon({ open }: { open: boolean }) {
  return (
    <ChevronDown className={`h-4 w-4 shrink-0 text-slate-500 transition-transform duration-(--dur-base) ease-(--ease-ios) ${open ? "rotate-180" : ""}`} />
  );
}

export function MonthGroup({
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
export function AttendeeEmailRow({
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
        className="min-w-0 flex-1 glass-surface-subtle px-3 py-2 text-body text-slate-100 outline-none transition focus:border-slate-50/60"
      />
      <span className="shrink-0 text-small">
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
          <span className="flex items-center gap-1.5 text-red-400">
            Not your friend yet
            <InviteToRegisterButton email={value.trim()} />
          </span>
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

