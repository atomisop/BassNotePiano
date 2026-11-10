"use client";

import { addMinutesToHHmm, classesInWindow, formatEtShort } from "@/lib/classScheduleLabels";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ArrowRight, CalendarPlus } from "@/components/ui/appIcons";
import { toast } from "@/components/ui/Toaster";
import { NotifyToggle, useNotifyStudent } from "@/components/admin/NotifyToggle";
import { newIdempotencyKey } from "@/lib/idempotencyClient";
import type { WindowMovePreview } from "@/lib/weeklyWindowMove";
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
  /** Who keeps one of its classes with a live plan (each links to their page). */
  holders: { userId: string; name: string; chunkIndex: number }[];
  /** Students waiting for one of its classes to open (each links to Set up plan with that time picked). */
  waiting: { userId: string; name: string; chunkIndex: number; setupHref: string }[];
}

interface ScheduleInput {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  label: string | null;
}

type ActionResult = { ok: true } | { ok: false; error: string };
type SetActiveResult = { ok: true; canceled?: number } | { ok: false; error: string };
type Person = { userId: string; name: string };

export interface AdminScheduleManagerProps {
  schedules: ScheduleRow[];
  onCreate: (input: ScheduleInput) => Promise<ActionResult>;
  /** A refusal because students are on the window names them (`people`), so each links to their page. */
  onUpdate: (scheduleId: string, input: ScheduleInput) => Promise<ActionResult | { ok: false; error: string; people?: Person[] }>;
  onSetActive: (scheduleId: string, active: boolean, cancelUpcoming?: boolean) => Promise<SetActiveResult>;
  onPreviewMove: (scheduleId: string, input: ScheduleInput) => Promise<{ ok: true; preview: WindowMovePreview } | { ok: false; error: string }>;
  onMoveEveryone: (scheduleId: string, input: ScheduleInput, key?: string, notify?: boolean) => Promise<{ ok: true; plans: number; classes: number; to: string } | { ok: false; error: string }>;
}

/** The start of a window's class (they start every hour): "4:00 PM". */
const classStart = (startTime: string, chunkIndex: number) => formatTimeLabel(addMinutesToHHmm(startTime, chunkIndex * 60));

/** Names, each a link, joined the way a sentence reads. */
function PeopleLinks({ people }: { people: { key: string; name: string; href: string; extra?: string }[] }) {
  return (
    <>
      {people.map((p, i) => (
        <span key={p.key}>
          {i > 0 && (i === people.length - 1 ? " and " : ", ")}
          <Link href={p.href} className="hit-slop text-slate-200 underline underline-offset-4 hover:text-slate-50">
            {p.name}
          </Link>
          {p.extra ? ` (${p.extra})` : ""}
        </span>
      ))}
    </>
  );
}

/**
 * "Move everyone with it": the new window is made, each weekly plan moves to the class at the same place in it, every other class moves
 * into the same week on the new day, and the old window is turned off. Shows exactly that first; nothing moves while something is in the way.
 */
function WindowMovePanel({ scheduleId, input, preview, onMoveEveryone, onClose }: { scheduleId: string; input: ScheduleInput; preview: WindowMovePreview; onMoveEveryone: AdminScheduleManagerProps["onMoveEveryone"]; onClose: () => void }) {
  const router = useRouter();
  const [notify, setNotify] = useNotifyStudent("student-changes");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState(() => newIdempotencyKey());
  const blocked = preview.problems.length > 0;

  async function move() {
    setBusy(true);
    setError(null);
    const hold = await toast.held("Moving everyone to the new time", () => onMoveEveryone(scheduleId, input, key, notify).catch(() => ({ ok: false as const, error: "Something went wrong. Try again." })), { mail: notify });
    setBusy(false);
    if (hold.undone) return;
    const result = hold.value;
    setKey(newIdempotencyKey());
    if (!result.ok) {
      setError(result.error);
      router.refresh();
      return;
    }
    toast.success(`Moved to ${result.to}: ${result.plans} weekly ${result.plans === 1 ? "plan" : "plans"}, ${result.classes} ${result.classes === 1 ? "class" : "classes"}`);
    onClose();
    router.refresh();
  }

  return (
    <div className="mt-3 grid gap-3 rounded-control bg-slate-50/5 p-3 ring-1 ring-inset ring-slate-50/10">
      <p className="flex flex-wrap items-center gap-1.5 text-small font-medium text-slate-100">
        {preview.from} <ArrowRight aria-hidden className="h-3.5 w-3.5" /> {preview.to}
      </p>
      {preview.plans.length > 0 && (
        <div className="text-small text-slate-300">
          <p className="text-slate-400">Weekly plans move:</p>
          <ul className="mt-1 grid gap-0.5">
            {preview.plans.map((p) => (
              <li key={p.userId}>
                <Link href={`/admin/users/${p.userId}`} className="hit-slop underline underline-offset-4">
                  {p.name}
                </Link>
                : {p.to}
              </li>
            ))}
          </ul>
        </div>
      )}
      {preview.classes.length > 0 && (
        <div className="text-small text-slate-300">
          <p className="text-slate-400">Other classes move into the same week:</p>
          <ul className="mt-1 grid gap-0.5">
            {preview.classes.map((c) => (
              <li key={c.bookingId}>
                {c.name}: {formatEtShort(c.from)} to {formatEtShort(c.to)}
              </li>
            ))}
          </ul>
        </div>
      )}
      {preview.plans.length === 0 && preview.classes.length === 0 && <p className="text-small text-slate-400">Nobody is on this time any more. It just moves.</p>}
      {blocked && (
        <ul className="grid gap-1 text-small text-amber-300">
          {preview.problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="text-small text-red-400">
          {error}
        </p>
      )}
      <NotifyToggle on={notify} onChange={setNotify} label="Notify the students" />
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" loading={busy} disabled={busy || blocked} onClick={() => void move()}>
          Move everyone
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={onClose}>
          Back
        </Button>
      </div>
      <p className="text-caption text-slate-500">The old time is turned off after everyone has moved. Each student is told once, only if Notify is on.</p>
    </div>
  );
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

export function AdminScheduleManager({ schedules, onCreate, onUpdate, onSetActive, onPreviewMove, onMoveEveryone }: AdminScheduleManagerProps) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // An edit refused because students are on the window: who they are, and the edit to move them with.
  const [refused, setRefused] = useState<{ scheduleId: string; input: ScheduleInput; people: Person[] } | null>(null);
  const [movePreview, setMovePreview] = useState<{ scheduleId: string; input: ScheduleInput; preview: WindowMovePreview } | null>(null);
  const [previewing, setPreviewing] = useState(false);

  async function previewMove(scheduleId: string, input: ScheduleInput) {
    setPreviewing(true);
    const result = await onPreviewMove(scheduleId, input).catch(() => ({ ok: false as const, error: "Something went wrong. Try again." }));
    setPreviewing(false);
    if (!result.ok) return setFormError(result.error);
    setMovePreview({ scheduleId, input, preview: result.preview });
  }

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
    setRefused(null);
    setMovePreview(null);
    setSubmitting(true);
    const result = await onUpdate(scheduleId, input);
    setSubmitting(false);
    if (!result.ok) {
      setFormError(result.error);
      if ("people" in result && result.people && result.people.length > 0) setRefused({ scheduleId, input, people: result.people });
      return;
    }
    setEditingId(null);
    router.refresh();
  }

  function stopEditing() {
    setEditingId(null);
    setFormError(null);
    setRefused(null);
    setMovePreview(null);
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
                      onCancel={stopEditing}
                    />
                    {refused?.scheduleId === row.id && !movePreview && (
                      <div className="mt-3 grid gap-2 text-small text-slate-300">
                        <p>
                          On this time: <PeopleLinks people={refused.people.map((p) => ({ key: p.userId, name: p.name, href: `/admin/users/${p.userId}` }))} />.
                        </p>
                        <div>
                          <Button type="button" size="sm" loading={previewing} onClick={() => void previewMove(row.id, refused.input)}>
                            Move everyone with it
                          </Button>
                        </div>
                      </div>
                    )}
                    {movePreview?.scheduleId === row.id && (
                      <WindowMovePanel scheduleId={row.id} input={movePreview.input} preview={movePreview.preview} onMoveEveryone={onMoveEveryone} onClose={stopEditing} />
                    )}
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
                      {row.holders.length > 0 && (
                        <p className="mt-0.5 text-small text-slate-400">
                          Weekly plans:{" "}
                          <PeopleLinks people={row.holders.map((h) => ({ key: `${h.userId}:${h.chunkIndex}`, name: h.name, href: `/admin/users/${h.userId}`, extra: classStart(row.startTime, h.chunkIndex) }))} />
                        </p>
                      )}
                      {row.waiting.length > 0 && (
                        <p className="mt-0.5 text-small text-slate-400">
                          {row.waiting.length} waiting:{" "}
                          <PeopleLinks people={row.waiting.map((w) => ({ key: `${w.userId}:${w.chunkIndex}`, name: w.name, href: w.setupHref, extra: classStart(row.startTime, w.chunkIndex) }))} />
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => (row.active && (row.upcomingBookings > 0 || row.holders.length > 0) ? setConfirmOffId(row.id) : handleToggleActive(row))}
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
                          stopEditing();
                          setEditingId(row.id);
                        }}
                        className={buttonVariants({ variant: "secondary", size: "sm" })}
                      >
                        Edit
                      </button>
                    </div>
                    {confirmOffId === row.id && (
                      <div className="w-full rounded-control bg-red-400/10 p-3 text-small text-slate-300 ring-1 ring-inset ring-red-400/20 sm:basis-full">
                        {row.holders.length > 0 && (
                          <p className="mb-1.5">
                            <PeopleLinks people={row.holders.map((h) => ({ key: `${h.userId}:${h.chunkIndex}`, name: h.name, href: `/admin/users/${h.userId}` }))} />{" "}
                            {row.holders.length === 1 ? "keeps" : "keep"} this time with a weekly plan. Turned off, nobody is booked here until you give each a new time.
                            To keep them together, use Edit and Move everyone with it instead.
                          </p>
                        )}
                        <p>
                          {row.upcomingBookings > 0
                            ? `${row.upcomingBookings} upcoming class${row.upcomingBookings === 1 ? " is" : "es are"} booked on this time. Turning it off stops new bookings only. What should happen to the booked classes?`
                            : "Turning it off stops new bookings."}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {row.upcomingBookings > 0 && (
                            <button type="button" onClick={() => handleToggleActive(row, true)} className={buttonVariants({ variant: "outline", size: "sm" })}>
                              Cancel them and tell the students
                            </button>
                          )}
                          <button type="button" onClick={() => handleToggleActive(row, false)} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                            {row.upcomingBookings > 0 ? "Keep them, turn off new bookings" : "Turn it off"}
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
