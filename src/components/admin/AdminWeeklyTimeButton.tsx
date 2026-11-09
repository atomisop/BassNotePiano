"use client";

import { NotifyToggle, useNotifyStudent } from "@/components/admin/NotifyToggle";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Clock } from "@/components/ui/appIcons";
import { Dialog } from "@/components/ui/Dialog";
import { buttonVariants } from "@/components/ui/button";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { toast } from "@/components/ui/Toaster";
import { moveWeeklyTimeAction, weeklyTimeChoicesAction } from "@/app/(dashboard)/admin/payment-plans/actions";
import { moveWeeklyTimeTypedAction, weeklyTimeTypedAction } from "@/app/(dashboard)/admin/schedule/weeklyTimeActions";
import type { WeeklyTimeChoice } from "@/lib/adminWeeklyTime";
import { clashSummary, type TypedWeeklyTime } from "@/lib/weeklyTimeRules";
import { ANOTHER_TIME, AnotherTimeFields, ClashMover, TimeFacts, choiceSuffix } from "@/components/admin/WeeklyTimeParts";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * Next to Pause on the student page: moves this person's standing weekly class, and every upcoming class on it, to another time. Works on
 * a group or parent plan too, since each person on one has their own weekly time. Every time no other plan keeps is listed: one with
 * someone else's class on it names them and moves that class right here; one kept for a contact asks first; "Another time…" types a day
 * and start time that has no window yet (a 45 minute window is made for it).
 */
export function AdminWeeklyTimeButton({ planId, compact = false }: { planId: string; compact?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState<WeeklyTimeChoice | null>(null);
  const [choices, setChoices] = useState<WeeklyTimeChoice[]>([]);
  const [typed, setTyped] = useState<WeeklyTimeChoice[]>([]);
  const [pick, setPick] = useState("");
  const [asking, setAsking] = useState(false);
  const [typingBusy, setTypingBusy] = useState(false);
  const [takeHeld, setTakeHeld] = useState(false);
  const [notify, setNotify] = useNotifyStudent("student-changes");

  async function load(keepPick = false) {
    const result = await weeklyTimeChoicesAction(planId).catch(() => ({ ok: false as const, error: "Something went wrong. Try again." }));
    setLoading(false);
    if (!result.ok) {
      toast.warning(result.error);
      if (!keepPick) setOpen(false);
      return;
    }
    setCurrent(result.current);
    setChoices(result.choices);
  }

  async function show() {
    setOpen(true);
    setLoading(true);
    setPick("");
    setTyped([]);
    setAsking(false);
    setTakeHeld(false);
    await load();
  }

  const all = [...choices, ...typed.filter((t) => !choices.some((c) => c.key === t.key))];
  const chosen = all.find((c) => c.key === pick) ?? null;
  const heldForOther = Boolean(chosen?.holds.some((h) => !h.mine));

  function choose(next: string) {
    if (next === ANOTHER_TIME) {
      setAsking(true);
      return;
    }
    setAsking(false);
    setTakeHeld(false);
    setPick(next);
  }

  async function pickTyped(time: TypedWeeklyTime) {
    setTypingBusy(true);
    const result = await weeklyTimeTypedAction(planId, time).catch(() => ({ ok: false as const, error: "Could not check that time." }));
    setTypingBusy(false);
    if (!result.ok) return void toast.warning(result.error);
    setTyped((list) => [...list.filter((x) => x.key !== result.choice.key), result.choice]);
    setAsking(false);
    setTakeHeld(false);
    setPick(result.choice.key);
  }

  /** A class was moved out of the way: the times load again (a typed one is checked again), so the time shows as free. */
  async function afterClassMoved() {
    if (chosen?.newTime) {
      const result = await weeklyTimeTypedAction(planId, chosen.newTime).catch(() => null);
      if (result?.ok) setTyped((list) => list.map((x) => (x.key === result.choice.key ? result.choice : x)));
    }
    await load(true);
  }

  async function save() {
    if (!chosen) return;
    setBusy(true);
    const run = () =>
      (chosen.newTime
        ? moveWeeklyTimeTypedAction(planId, chosen.newTime, notify).then((r) => (r.ok ? { ok: true, error: null, label: r.label } : { ok: false, error: r.error, label: undefined }))
        : moveWeeklyTimeAction(planId, chosen.scheduleId, chosen.chunkIndex, notify)
      ).catch(() => ({ ok: false, error: "Something went wrong. Try again." as string | null, label: undefined as string | undefined }));
    const hold = await toast.held("Moving the weekly time", run, { mail: notify });
    setBusy(false);
    if (hold.undone) return;
    const result = hold.value;
    if (!result.ok) {
      toast.warning(result.error ?? "Could not move the weekly time.");
      return;
    }
    toast.success(`Weekly time is now ${result.label ?? chosen.label}`);
    setOpen(false);
    router.refresh();
  }

  const byDay = DAYS.map((day, i) => ({ day, items: all.filter((c) => c.dayOfWeek === i) })).filter((g) => g.items.length > 0);
  const field = "h-11 w-full rounded-control border border-(--field-edge) bg-neu-base px-4 text-body text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-ring";
  const ready = Boolean(chosen) && !asking && chosen!.clashes.length === 0 && (!heldForOther || takeHeld);

  return (
    <>
      <button type="button" onClick={() => void show()} aria-haspopup="dialog" className={buttonVariants({ variant: "secondary", size: "sm", className: compact ? "h-8 px-2.5" : "" })}>
        <Clock aria-hidden className="mr-1.5 h-3.5 w-3.5" />
        Weekly time
      </button>
      <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)} title="Move the weekly time">
        <NotifyToggle on={notify} onChange={setNotify} className="mb-3" />
        <div className="grid gap-4">
          <p className="text-small text-slate-400">
            {current ? `Now ${current.label}.` : "No weekly time yet."} Every upcoming class moves to the new time, and later months are booked there as they are paid. Classes
            already taught stay where they are. The student is told only if Notify is on.
          </p>
          {loading ? (
            <div className="inline-flex items-center gap-2 text-small text-slate-400">
              <MorphingSquare size={12} />
              Finding times
            </div>
          ) : (
            <div>
              <label className="grid gap-1.5">
                <span className="text-small font-medium text-slate-200">New weekly time</span>
                <select value={asking ? ANOTHER_TIME : pick} onChange={(e) => choose(e.target.value)} className={field}>
                  <option value="">Pick a time</option>
                  {byDay.map((g) => (
                    <optgroup key={g.day} label={g.day}>
                      {g.items.map((c) => (
                        <option key={c.key} value={c.key}>
                          {c.label}
                          {c.newTime ? " (new)" : ""}
                          {choiceSuffix(c, clashSummary)}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                  <option value={ANOTHER_TIME}>Another time…</option>
                </select>
              </label>
              {(asking || all.length === 0) && <AnotherTimeFields onUse={(t) => void pickTyped(t)} busy={typingBusy} />}
              {chosen && !asking && <TimeFacts holds={chosen.holds} waiting={chosen.waiting} isNew={Boolean(chosen.newTime)} />}
              {chosen && !asking && heldForOther && (
                <label className="mt-1.5 flex items-center gap-2 text-small text-slate-200">
                  <input type="checkbox" checked={takeHeld} onChange={(e) => setTakeHeld(e.target.checked)} className="h-4 w-4 accent-signal" />
                  Take it anyway (the hold stays on Contacts)
                </label>
              )}
              {chosen && !asking && chosen.clashes.length > 0 && (
                <div className="mt-2 grid gap-2 rounded-xl bg-amber-300/10 p-3">
                  <p className="text-small font-medium text-amber-300">
                    {chosen.clashes.length === 1 ? "Someone has a class on this time. Move it, then the time is free." : "Some people have classes on this time. Move them, then the time is free."}
                  </p>
                  <ul className="grid gap-2">
                    {chosen.clashes.map((c) => (
                      <ClashMover key={c.bookingId} clash={c} notify={notify} onMoved={() => void afterClassMoved()} />
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" disabled={busy} onClick={() => setOpen(false)} className={buttonVariants({ variant: "secondary" })}>
              Cancel
            </button>
            <button type="button" disabled={busy || !ready} onClick={() => void save()} aria-busy={busy} className={buttonVariants({ variant: "primary" })}>
              {busy && <MorphingSquare size={14} className="mr-2 shrink-0" />}
              Move every class
            </button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
