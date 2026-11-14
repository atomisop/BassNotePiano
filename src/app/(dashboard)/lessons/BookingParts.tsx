"use client";

import { viewerLocale, viewerZone } from "@/lib/viewerClock";
import { Collapse } from "@/components/ui/Collapse";
import { useState } from "react";
import { formatEndTime } from "@/lib/classScheduleLabels";
import { CheckIcon, XIcon } from "@/components/ui/icons";
import { CLASS_MINUTES, CREDITS_PER_CLASS, creditsLabelFromStored } from "@/lib/classCreditPricing";
import { weekRangeForOccurrence } from "@/lib/bookingRules";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { DISCORD_INVITE_URL } from "@/lib/discord";
import { AskTogetherButton } from "@/components/lessons/AskTogetherButton";
import { MessageSupportButton } from "@/components/lessons/MessageSupportButton";
import { buttonVariants } from "@/components/ui/button";
import { JoinClassButton } from "@/components/lessons/JoinClassButton";
import { ChevronDown } from "@/components/ui/appIcons";
import { ActionMenu } from "@/components/ui/ActionMenu";
import { Meta } from "@/components/ui/CardKit";
import { StatusDot } from "@/components/ui/StatusDot";

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
  /** Seats per slot and how many are still free (shown as "N left" only when a shared slot is nearly full). */
  seats?: number;
  seatsLeft?: number;
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
  return new Date(iso).toLocaleDateString(viewerLocale(), { weekday: "long", month: "short", day: "numeric", timeZone: viewerZone() });
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
  return new Date(iso).toLocaleTimeString(viewerLocale(), { hour: "numeric", minute: "2-digit", timeZone: viewerZone() });
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
  // The month in the same clock the labels use, so the grouping never differs between the server's render and the browser's.
  return new Date(iso).toLocaleDateString("en-CA", { year: "numeric", month: "2-digit", timeZone: viewerZone() }).slice(0, 7);
}

export function monthLabel(iso: string): string {
  return new Date(iso).toLocaleDateString(viewerLocale(), { month: "long", year: "numeric", timeZone: viewerZone() });
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

/**
 * One booked class as a row (DESIGN.md, Hierarchy 8): the day and time are the line you read, one quiet line under it, and every
 * change (calendar, reschedule, support, cancel) behind one "More" menu so the list stays calm. Cancel is last and red, and still
 * asks first. Rendered inside a list with hairlines between the rows (see the Upcoming tab and MonthGroup).
 */
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
  const [supportError, setSupportError] = useState<string | null>(null);
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
  const noShow = b.status === "COMPLETED" && b.attendance === "NO_SHOW";

  return (
    <div className="py-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`text-body font-semibold tabular-nums ${scheduled ? "text-slate-50" : "text-slate-300"}`}>
            {start.toLocaleDateString(viewerLocale(), { weekday: "short", month: "short", day: "numeric", timeZone: viewerZone() })}
            <span aria-hidden className="text-slate-500"> · </span>
            {start.toLocaleTimeString(viewerLocale(), { hour: "numeric", minute: "2-digit", timeZone: viewerZone() })}
          </p>
          <Meta
            className="mt-0.5"
            items={[
              b.label ?? "Class",
              `to ${formatEndTime(b.scheduledAt, b.creditsSpent)}`,
              `${minutes} min`,
              b.creditsSpent !== CREDITS_PER_CLASS && creditsLabel(b.creditsSpent),
              b.reserved && scheduled && "Your weekly class",
              b.inPerson && scheduled && "In person",
              b.status === "COMPLETED" && b.attendance === "PRESENT" && "Attended",
            ]}
          />
          {changeEligible && (
            <p className="mt-0.5 text-caption text-slate-500">
              Free to change until {freeUntil.toLocaleString(viewerLocale(), { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: viewerZone() })}
            </p>
          )}
          {insideWindow && (
            <p className="mt-1 text-small text-slate-500">
              Starts within {cancellationCutoffHours} hours, so changes now go through the team. Message support and they will sort it out.
            </p>
          )}
          {noShow && <p className="mt-1 text-small text-red-400">Marked no-show, still charged</p>}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {/* Status only when it is news: a canceled class says so; a healthy one needs no word. */}
          {b.status === "CANCELED" && <StatusDot tone="neutral">{STATUS_LABEL[b.status]}</StatusDot>}
          {scheduled && hoursUntil > -1 && hoursUntil <= 0.5 && !b.inPerson && (
            // With Discord not connected it reads "Connect Discord and join" and opens this class's call once connected.
            <JoinClassButton href={b.discordUrl ?? DISCORD_INVITE_URL} bookingId={b.id} className={buttonVariants({ variant: "primary", size: "sm" })} />
          )}
          {scheduled && hoursUntil > -1 && !(cancelEligible && confirmingCancel) && (
            <ActionMenu label="More" align="right">
              {hoursUntil > 0 && (
                <a href={`/api/calendar/class?s=${encodeURIComponent(b.scheduledAt)}&m=${minutes}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                  Add to calendar
                </a>
              )}
              {rescheduleEligible && (
                <button
                  type="button"
                  onClick={() => onStartReschedule(b)}
                  disabled={canceling}
                  aria-pressed={isBeingRescheduled}
                  className={buttonVariants({ variant: "ghost", size: "sm", className: isBeingRescheduled ? "text-signal-fg" : undefined })}
                >
                  {isBeingRescheduled ? "Picking new time…" : b.reserved ? "Move this week" : "Reschedule"}
                </button>
              )}
              <MessageSupportButton bookingId={b.id} onError={setSupportError} className={buttonVariants({ variant: "ghost", size: "sm" })} />
              {cancelEligible && (
                <button
                  type="button"
                  onClick={() => setConfirmingCancel(true)}
                  disabled={canceling}
                  className={buttonVariants({ variant: "ghost", size: "sm", className: "text-red-300 hover:text-red-200" })}
                >
                  {b.reserved ? "Skip" : "Cancel"}
                </button>
              )}
            </ActionMenu>
          )}
        </div>
      </div>

      {supportError && (
        <p role="alert" className="mt-2 text-small text-red-400">
          {supportError}
        </p>
      )}

      {cancelEligible && confirmingCancel && (
        <div className="lgx-row mt-3 rounded-xl px-4 py-3">
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
    <div className="overflow-hidden lgx-card rounded-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="tap flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-slate-50/4 sm:px-5"
      >
        <span className="text-body font-medium text-slate-100">{group.label}</span>
        <span className="flex items-center gap-2 text-small tabular-nums text-slate-500">
          {group.bookings.length} {group.bookings.length === 1 ? "class" : "classes"}
          <ChevronIcon open={open} />
        </span>
      </button>
      <Collapse open={open}>
        <div className="divide-y divide-slate-50/8 border-t border-slate-50/8 px-4 sm:px-5">
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
  const typed = value.trim();
  // Not a friend (or no account, which looks the same): they are asked in place, and the class books once they say yes.
  const notFriend = typed !== "" && Boolean(status) && !status?.checking && !status?.verified && !status?.found;
  return (
    <div>
      <div className="flex items-center gap-2">
        <input
          type="email"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="student@email.com"
          className="min-w-0 flex-1 glass-surface-subtle px-3 py-2 text-body text-slate-100 outline-none transition focus:border-slate-50/60"
        />
        <span className="shrink-0 text-small">
          {typed === "" ? null : status?.checking ? (
            <span className="text-slate-500">Checking…</span>
          ) : status?.verified ? (
            <span className="flex items-center gap-1 text-slate-50">
              <CheckIcon size={11} />
              {status.name ?? "Verified"}
            </span>
          ) : status?.found ? (
            <span className="text-red-400">Not verified</span>
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
      {notFriend && (
        <p className="mt-1.5 flex flex-wrap items-center gap-2 pl-1 text-small text-red-400">
          Not your friend yet
          <AskTogetherButton key={typed.toLowerCase()} email={typed} />
        </p>
      )}
    </div>
  );
}

