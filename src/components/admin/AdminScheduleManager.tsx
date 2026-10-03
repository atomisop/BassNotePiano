"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MorphingSquare } from "@/components/ui/morphing-square";

interface ScheduleRow {
  id: string;
  dayOfWeek: number;
  startTime: string;
  durationMin: number;
  creditCost: number;
  label: string | null;
  active: boolean;
}

interface ScheduleInput {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  label: string | null;
}

type ActionResult = { ok: true } | { ok: false; error: string };

export interface AdminScheduleManagerProps {
  schedules: ScheduleRow[];
  onCreate: (input: ScheduleInput) => Promise<ActionResult>;
  onUpdate: (scheduleId: string, input: ScheduleInput) => Promise<ActionResult>;
  onSetActive: (scheduleId: string, active: boolean) => Promise<ActionResult>;
}

const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** durationMin minutes past "HH:mm" startTime, as its own "HH:mm" — the inverse of what resolveDurationMin computes server-side, needed here to pre-fill an edit form's end-time field from stored start+duration. */
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
            className="mt-1 w-full glass-surface-subtle px-3 py-2 text-body text-slate-100 outline-none transition focus:border-[rgb(var(--c-s-50)/0.6)] disabled:opacity-60"
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
            className="mt-1 w-full glass-surface-subtle px-3 py-2 text-body text-slate-100 outline-none transition focus:border-[rgb(var(--c-s-50)/0.6)] disabled:opacity-60"
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
            className="mt-1 w-full glass-surface-subtle px-3 py-2 text-body text-slate-100 outline-none transition focus:border-[rgb(var(--c-s-50)/0.6)] disabled:opacity-60"
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
          className="mt-1 w-full glass-surface-subtle px-3 py-2 text-body text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-[rgb(var(--c-s-50)/0.6)] disabled:opacity-60"
        />
      </label>
      {error && <p className="text-small text-red-400">{error}</p>}
      <div className="flex gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="tap flex-1 rounded-lg py-2 text-small font-medium text-slate-300 transition disabled:opacity-50 bg-neu-base shadow-raised-low hover:shadow-raised-mid active:shadow-pressed-low"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="tap cta-sheen cta-fill flex flex-1 items-center justify-center rounded-lg py-2 text-small font-semibold disabled:cursor-not-allowed disabled:opacity-60"
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

  async function handleToggleActive(row: ScheduleRow) {
    setBusyId(row.id);
    await onSetActive(row.id, !row.active);
    setBusyId(null);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {byDay.length === 0 && (
        <p className="glass-surface p-6 text-center text-small text-slate-500">No weekly slots yet — add the first one below.</p>
      )}

      {grouped
        .filter((g) => g.rows.length > 0)
        .map((group) => (
          <div key={group.day} className="glass-surface p-5">
            <h3 className="text-body text-slate-50 font-semibold">{group.label}</h3>
            <div className="mt-3 space-y-2">
              {group.rows.map((row) =>
                editingId === row.id ? (
                  <div key={row.id} className="rounded-xl border border-[rgb(var(--c-s-50)/0.3)] p-3">
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
                  </div>
                ) : (
                  <div
                    key={row.id}
                    className={`flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between ${
                      row.active ? "border-transparent bg-neu-base shadow-raised-low" : "border-transparent opacity-50 bg-neu-base shadow-raised-low"
                    }`}
                  >
                    <div>
                      <p className="text-small text-slate-100">
                        {formatTimeLabel(row.startTime)}–{formatTimeLabel(endTimeFromDuration(row.startTime, row.durationMin))}
                        {row.label && ` · ${row.label}`}
                      </p>
                      <p className="mt-0.5 text-small text-slate-500">
                        {row.durationMin} min window · up to {row.creditCost} credit{row.creditCost === 1 ? "" : "s"} ·{" "}
                        {row.active ? "Bookable" : "Off — not shown to students"}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(row.id);
                          setFormError(null);
                        }}
                        className="tap rounded-lg px-3 py-1.5 text-small font-medium text-slate-300 transition hover:text-[rgb(var(--c-s-50))] bg-neu-base shadow-raised-low hover:shadow-raised-mid active:shadow-pressed-low"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleActive(row)}
                        disabled={busyId === row.id}
                        className={`tap flex items-center justify-center rounded-lg border px-3 py-1.5 text-small font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                          row.active
                            ? "border-red-400/20 text-red-400 hover:border-red-400/40 hover:text-red-300"
                            : "border-slate-50/30 text-slate-100 hover:bg-slate-50/10"
                        }`}
                      >
                        {busyId === row.id ? <MorphingSquare size={12} /> : row.active ? "Turn off" : "Turn on"}
                      </button>
                    </div>
                  </div>
                ),
              )}
            </div>
          </div>
        ))}

      {adding ? (
        <div className="glass-surface p-5">
          <h3 className="mb-3 text-body text-slate-50 font-semibold">New weekly slot</h3>
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
          className="w-full rounded-xl border border-dashed border-ink/15 py-3 text-small font-medium text-slate-400 transition hover:border-[rgb(var(--c-s-50)/0.4)] hover:text-[rgb(var(--c-s-50))]"
        >
          + Add a weekly slot
        </button>
      )}
    </div>
  );
}
