"use client";

import { classesInWindow } from "@/lib/classScheduleLabels";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { CalendarPlus } from "@/components/ui/appIcons";
import { toast } from "@/components/ui/Toaster";
import { StatusDot } from "@/components/ui/StatusDot";
import { Meta } from "@/components/ui/CardKit";

interface ScheduleRow {
  id: string;
  dayOfWeek: number;
  startTime: string;
  durationMin: number;
  creditCost: number;
  label: string | null;
  active: boolean;
  /** Future classes already booked on this slot. */
  upcomingBookings: number;
}

interface ScheduleInput {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  label: string | null;
}

type ActionResult = { ok: true } | { ok: false; error: string };
type SetActiveResult = { ok: true; canceled?: number } | { ok: false; error: string };

export interface AdminScheduleManagerProps {
  schedules: ScheduleRow[];
  onCreate: (input: ScheduleInput) => Promise<ActionResult>;
  onUpdate: (scheduleId: string, input: ScheduleInput) => Promise<ActionResult>;
  onSetActive: (scheduleId: string, active: boolean, cancelUpcoming?: boolean) => Promise<SetActiveResult>;
}

const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** durationMin minutes past "HH:mm" startTime, as its own "HH:mm", the inverse of what resolveDurationMin computes server-side, needed here to pre-fill an edit form's end-time field from stored start+duration. */
function endTimeFromDuration(startTime: string, durationMin: number): string {
  const [h, m] = startTime.split(":").map(Number);
  const totalMin = h * 60 + m + durationMin;
  const hh = Math.floor(totalMin / 60) % 24;
  const mm = totalMin % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function formatTimeLabel(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

function ScheduleForm({
  initial,
  submitting,
  error,
  onSubmit,
  onCancel,
}: {
  initial: ScheduleInput;
  submitting: boolean;
  error: string | null;
  onSubmit: (input: ScheduleInput) => void;
  onCancel?: () => void;
}) {
  const [dayOfWeek, setDayOfWeek] = useState(initial.dayOfWeek);
  const [startTime, setStartTime] = useState(initial.startTime);
  const [endTime, setEndTime] = useState(initial.endTime);
  const [label, setLabel] = useState(initial.label ?? "");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({ dayOfWeek, startTime, endTime, label: label.trim() || null });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-small text-slate-500">
          Day
          <select
            value={dayOfWeek}
            onChange={(e) => setDayOfWeek(Number(e.target.value))}
            disabled={submitting}
            className="mt-1 w-full glass-surface-subtle px-3 py-2 text-body text-slate-100 outline-none transition focus:border-slate-50/60 disabled:opacity-60"
          >
            {DAY_LABELS.map((d, i) => (
              <option key={i} value={i}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <label className="text-small text-slate-500">
          Starts
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            required
            disabled={submitting}
            className="mt-1 w-full glass-surface-subtle px-3 py-2 text-body text-slate-100 outline-none transition focus:border-slate-50/60 disabled:opacity-60"
          />
        </label>
        <label className="text-small text-slate-500">
          Ends
          <input
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            required
            disabled={submitting}
            className="mt-1 w-full glass-surface-subtle px-3 py-2 text-body text-slate-100 outline-none transition focus:border-slate-50/60 disabled:opacity-60"
          />
        </label>
      </div>
      <label className="block text-small text-slate-500">
        Label (optional)
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. Monday class"
          disabled={submitting}
          className="mt-1 w-full glass-surface-subtle px-3 py-2 text-body text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-slate-50/60 disabled:opacity-60"
        />
      </label>
      {error && <p className="text-small text-red-400">{error}</p>}
      <div className="flex gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className={buttonVariants({ variant: "secondary", size: "sm", className: "flex-1" })}
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={submitting}
          className={buttonVariants({ variant: "primary", size: "sm", className: "flex flex-1" })}
        >
          {submitting && <MorphingSquare size={12} className="mr-1.5 shrink-0" />}
          {submitting ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

export function AdminScheduleManager({ schedules, onCreate, onUpdate, onSetActive }: AdminScheduleManagerProps) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const byDay = DAY_LABELS.map((_, day) => schedules.filter((s) => s.dayOfWeek === day)).flat();
  const grouped = DAY_LABELS.map((label, day) => ({ day, label, rows: schedules.filter((s) => s.dayOfWeek === day) }));

  async function handleCreate(input: ScheduleInput) {
    setFormError(null);
    setSubmitting(true);
    const result = await onCreate(input);
    setSubmitting(false);
    if (!result.ok) {
      setFormError(result.error);
      return;
    }
    setAdding(false);
    router.refresh();
  }

  async function handleUpdate(scheduleId: string, input: ScheduleInput) {
    setFormError(null);
    setSubmitting(true);
    const result = await onUpdate(scheduleId, input);
    setSubmitting(false);
    if (!result.ok) {
      setFormError(result.error);
      return;
    }
    setEditingId(null);
    router.refresh();
  }

  const [confirmOffId, setConfirmOffId] = useState<string | null>(null);

  async function handleToggleActive(row: ScheduleRow, cancelUpcoming = false) {
    setConfirmOffId(null);
    // Retiring a time cancels the classes booked on it, which cannot be brought back, so that one waits for Undo.
    if (cancelUpcoming && !(await toast.hold("Retiring this weekly time", { mail: true }))) return;
    setBusyId(row.id);
    await onSetActive(row.id, !row.active, cancelUpcoming);
    setBusyId(null);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {byDay.length === 0 && (
        <EmptyState icon={<CalendarPlus />} title="No weekly times yet" description="Add the days and hours you teach, and students can book them." />
      )}

      {grouped
        .filter((g) => g.rows.length > 0)
        .map((group) => (
          <section key={group.day} aria-label={group.label}>
            {/* The day is a quiet group title; each time inside it is the thing to read. */}
            <h2 className="px-1 text-caption font-medium uppercase tracking-caps text-slate-500">{group.label}</h2>
            <ul className="mt-2 divide-y divide-slate-50/8 overflow-hidden rounded-card bg-neu-base shadow-raised-mid">
              {group.rows.map((row) =>
                editingId === row.id ? (
                  <li key={row.id} className="p-4">
                    <ScheduleForm
                      initial={{
                        dayOfWeek: row.dayOfWeek,
                        startTime: row.startTime,
                        endTime: endTimeFromDuration(row.startTime, row.durationMin),
                        label: row.label,
                      }}
                      submitting={submitting}
                      error={formError}
                      onSubmit={(input) => handleUpdate(row.id, input)}
                      onCancel={() => {
                        setEditingId(null);
                        setFormError(null);
                      }}
                    />
                  </li>
                ) : (
                  <li key={row.id} className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                    <div className={row.active ? "min-w-0" : "min-w-0 opacity-60"}>
                      <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <span className="text-title font-semibold tabular-nums text-slate-50">
                          {formatTimeLabel(row.startTime)} to {formatTimeLabel(endTimeFromDuration(row.startTime, row.durationMin))}
                        </span>
                        {/* Open is the normal state, so it gets no badge; Off is the news. */}
                        {!row.active && <StatusDot tone="neutral">Off</StatusDot>}
                      </p>
                      <Meta
                        className="mt-0.5"
                        items={[
                          row.label,
                          `${row.durationMin} min`,
                          `${classesInWindow(row.durationMin)} ${classesInWindow(row.durationMin) === 1 ? "slot" : "slots"}`,
                          row.upcomingBookings > 0 ? <span className="text-slate-300">{row.upcomingBookings} booked</span> : null,
                        ]}
                      />
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => (row.active && row.upcomingBookings > 0 ? setConfirmOffId(row.id) : handleToggleActive(row))}
                        disabled={busyId === row.id}
                        className={buttonVariants({
                          variant: row.active ? "ghost" : "secondary",
                          size: "sm",
                          className: row.active ? "text-red-300 hover:text-red-200" : undefined,
                        })}
                      >
                        {busyId === row.id ? <MorphingSquare size={12} /> : row.active ? "Turn off" : "Turn on"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(row.id);
                          setFormError(null);
                        }}
                        className={buttonVariants({ variant: "secondary", size: "sm" })}
                      >
                        Edit
                      </button>
                    </div>
                    {confirmOffId === row.id && (
                      <div className="w-full rounded-control bg-red-400/10 p-3 text-small text-slate-300 ring-1 ring-inset ring-red-400/20 sm:basis-full">
                        <p>
                          {row.upcomingBookings} upcoming class{row.upcomingBookings === 1 ? " is" : "es are"} booked on this time. Turning it off stops new
                          bookings only. What should happen to the booked classes?
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <button type="button" onClick={() => handleToggleActive(row, true)} className={buttonVariants({ variant: "outline", size: "sm" })}>
                            Cancel them and tell the students
                          </button>
                          <button type="button" onClick={() => handleToggleActive(row, false)} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                            Keep them, turn off new bookings
                          </button>
                          <button type="button" onClick={() => setConfirmOffId(null)} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                            Back
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                ),
              )}
            </ul>
          </section>
        ))}

      {adding ? (
        <div className="rounded-card bg-neu-base p-4 shadow-raised-mid md:p-5">
          <h2 className="mb-3 text-title text-slate-50 font-semibold">New weekly slot</h2>
          <ScheduleForm
            initial={{ dayOfWeek: 1, startTime: "11:00", endTime: "13:00", label: null }}
            submitting={submitting}
            error={formError}
            onSubmit={handleCreate}
            onCancel={() => {
              setAdding(false);
              setFormError(null);
            }}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="w-full rounded-xl border border-dashed border-ink/15 py-3 text-small font-medium text-slate-400 transition hover:border-slate-50/40 hover:text-slate-50 bg-neu-base shadow-raised-low active:shadow-pressed-low hover:shadow-raised-mid"
        >
          + Add a weekly slot
        </button>
      )}
    </div>
  );
}
