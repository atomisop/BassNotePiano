"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Wrench, X } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Hint } from "@/components/ui/Hint";
import { ViewMore } from "@/components/ui/ViewMore";
import { toast } from "@/components/ui/Toaster";
import { newIdempotencyKey } from "@/lib/idempotencyClient";
import { planBuilderApplyAction, planBuilderContextAction, planBuilderPreviewAction } from "@/app/(dashboard)/admin/payment-plans/actions";
import type { PlanBuilderContext, PlanBuilderPreview } from "@/lib/planBuilder";
import type { TimelineClassState } from "@/lib/planTimeline";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const usd = (cents: number) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
const timeLabel = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
};
const dateLabel = (ymd: string) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const todayEt = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });

const STATE: Record<TimelineClassState, { label: string; cls: string }> = {
  taught: { label: "taught", cls: "bg-emerald-400/15 text-emerald-300" },
  booked: { label: "booked", cls: "bg-signal/16 text-signal-fg" },
  missed: { label: "missed", cls: "bg-amber-400/15 text-amber-300" },
  unpaid: { label: "not paid yet", cls: "bg-neu-base text-slate-500 shadow-pressed-low" },
};

/**
 * The plan builder (owner only): sets up or re-anchors a student's plan from a start date that can be in the past. Pick the length,
 * the weekly time, the day the first cycle began, how many bills are paid and the classes already taught; the whole timeline shows
 * before anything is written, then one tap applies it.
 */
export function AdminPlanBuilderButton({ userId }: { userId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [ctx, setCtx] = useState<PlanBuilderContext | null>(null);
  const [startDate, setStartDate] = useState(todayEt());
  const [term, setTerm] = useState<PlanBuilderContext["term"]>("TERM_6");
  const [paid, setPaid] = useState(1);
  const [slotKey, setSlotKey] = useState("");
  const [taught, setTaught] = useState<string[]>([]);
  const [taughtInput, setTaughtInput] = useState("");
  const [charge, setCharge] = useState(true);
  // An existing plan is rebuilt around ONE class that was already taught: its day is where the billing cycle starts.
  const [taughtOne, setTaughtOne] = useState("");
  // The billing cycle starts here (the taught day unless it is changed): the next bill is 28 days after it.
  const [cycleStart, setCycleStart] = useState("");
  const [recordPay, setRecordPay] = useState(false);
  const [preview, setPreview] = useState<PlanBuilderPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState(() => newIdempotencyKey());

  async function openBox() {
    setOpen(true);
    setCtx(null);
    setPreview(null);
    setError(null);
    const result = await planBuilderContextAction(userId).catch(() => ({ ok: false as const, error: "Could not load." }));
    if (!result.ok) {
      toast.warning(result.error);
      return setOpen(false);
    }
    const c = result.context;
    setCtx(c);
    setTerm(c.term);
    setPaid(c.installmentsPaid);
    setStartDate(c.currentStart ?? todayEt());
    setTaught([]);
    setTaughtOne("");
    setCycleStart("");
    setRecordPay(c.openPayment);
    setCharge(true);
    const first = c.slot ?? c.choices[0];
    setSlotKey(first ? `${first.scheduleId}:${first.chunkIndex}` : "");
  }

  const input = useMemo(() => {
    const [scheduleId, chunk] = slotKey.split(":");
    if (!scheduleId || chunk === undefined) return null;
    if (ctx?.mode === "existing") {
      if (!taughtOne) return null;
      return { userId, term, scheduleId, chunkIndex: Number(chunk), startDate: cycleStart && cycleStart <= taughtOne ? cycleStart : taughtOne, installmentsPaid: paid, taughtDates: [taughtOne], chargeTaught: charge, recordPayment: recordPay };
    }
    return { userId, term, scheduleId, chunkIndex: Number(chunk), startDate, installmentsPaid: paid, taughtDates: taught, chargeTaught: charge };
  }, [ctx, userId, term, slotKey, startDate, paid, taught, charge, taughtOne, cycleStart, recordPay]);

  // The timeline follows the form, a moment after the last change.
  useEffect(() => {
    if (!open || !ctx || !input) return;
    let live = true;
    const t = window.setTimeout(async () => {
      const result = await planBuilderPreviewAction(input).catch(() => ({ ok: false as const, error: "Could not build the timeline." }));
      if (!live) return;
      if (result.ok) {
        setPreview(result.preview);
        setError(null);
      } else {
        setPreview(null);
        setError(result.error);
      }
    }, 250);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, [open, ctx, input]);

  const termInfo = ctx?.terms.find((t) => t.term === term);
  const cycles = ctx?.mode === "existing" ? ctx.cycles : termInfo?.cycles ?? 1;

  async function apply() {
    if (!input || !preview) return;
    setBusy(true);
    const result = await planBuilderApplyAction(input, key).catch(() => ({ ok: false, error: "Something went wrong. Check the plan before trying again." as string | null, result: undefined }));
    setBusy(false);
    if (!result.ok) return setError(result.error ?? "Could not apply.");
    const done = result.result;
    const classes = (stored: number) => `${stored / 2} credit${stored === 2 ? "" : "s"}`;
    if (done && done.charged > 0) toast.success(`Charged ${classes(done.charged)}. Credits ${done.balanceBefore / 2} to ${done.balanceAfter / 2}.`);
    else if (done && done.alreadyMarked.length > 0) toast.warning(`${done.alreadyMarked.map(dateLabel).join(", ")} was already marked present, so nothing more was charged. Credits stay ${done.balanceAfter / 2}.`);
    else toast.success(ctx?.mode === "new" ? "Plan created" : "Plan rebuilt");
    setKey(newIdempotencyKey());
    setOpen(false);
    router.refresh();
  }

  const field = "min-h-11 min-w-0 rounded-xl bg-neu-base px-3.5 py-2 text-body text-slate-100 shadow-pressed-low";

  return (
    <>
      <button type="button" onClick={() => void openBox()} aria-haspopup="dialog" className={buttonVariants({ variant: "secondary", size: "sm", className: "h-8 px-2.5" })}>
        <Wrench aria-hidden className="mr-1.5 h-3.5 w-3.5" />
        Plan builder
      </button>
      <Dialog
        open={open}
        onOpenChange={(next) => !busy && setOpen(next)}
        title={ctx ? `${ctx.mode === "new" ? "Build a plan for" : "Rebuild the plan for"} ${ctx.studentName}` : "Plan builder"}
        footer={
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:justify-end">
            <Button type="button" variant="secondary" disabled={busy} onClick={() => setOpen(false)} className="w-full sm:w-auto">
              Never mind
            </Button>
            <Button type="button" disabled={!preview || busy} loading={busy} onClick={apply} className="w-full sm:w-auto">
              {ctx?.mode === "new" ? "Create the plan" : "Apply"}
            </Button>
          </div>
        }
      >
        {!ctx ? (
          <p className="text-small text-slate-500">Loading…</p>
        ) : (
          <div className="space-y-4">
            {ctx.mode === "existing" ? (
              <>
                <p className="flex items-center gap-1 text-small text-slate-400">
                  Line the plan up with the class you taught
                  <Hint label="What this does">
                    Pick the day you already taught. That class is charged (one credit) and counts as class 1 of the 28 days. The billing cycle starts on the date you choose below (the taught day by default), the next bill lands 28 days after it, and the other weekly classes are booked from there. Nothing changes until you press Apply.
                  </Hint>
                </p>
                <label className="block">
                  <span className="mb-1 block text-small font-medium text-slate-200">Class already taught on</span>
                  <input type="date" value={taughtOne} max={todayEt()} onChange={(e) => setTaughtOne(e.target.value)} className={`${field} w-full`} />
                </label>
                <label className="block">
                  <span className="mb-1 flex items-center gap-1 text-small font-medium text-slate-200">
                    Billing cycle starts on
                    <Hint label="About the billing cycle">The next bill lands exactly 28 days after this date. It is the taught day unless you pick an earlier one (within the same 28 days).</Hint>
                  </span>
                  <input type="date" value={cycleStart || taughtOne} min={taughtOne ? new Date(new Date(`${taughtOne}T12:00:00Z`).getTime() - 27 * 86_400_000).toISOString().slice(0, 10) : undefined} max={taughtOne || todayEt()} disabled={!taughtOne} onChange={(e) => setCycleStart(e.target.value)} className={`${field} w-full disabled:opacity-50`} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-small font-medium text-slate-200">Weekly time (every week after)</span>
                  <select value={slotKey} onChange={(e) => setSlotKey(e.target.value)} className={`${field} w-full`}>
                    {ctx.choices.map((c) => (
                      <option key={`${c.scheduleId}:${c.chunkIndex}`} value={`${c.scheduleId}:${c.chunkIndex}`}>
                        {DAYS[c.dayOfWeek]} {timeLabel(c.startTime)}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="space-y-1.5 rounded-xl bg-neu-base p-3 shadow-pressed-low">
                  <label className="flex items-center gap-2 text-small text-slate-200">
                    <input type="checkbox" checked={charge} onChange={(e) => setCharge(e.target.checked)} className="h-4 w-4 accent-signal" />
                    Spend 1 class credit for the class taught
                  </label>
                  {ctx.openPayment && (
                    <label className="flex items-center gap-2 text-small text-slate-200">
                      <input type="checkbox" checked={recordPay} onChange={(e) => setRecordPay(e.target.checked)} className="h-4 w-4 accent-signal" />
                      The bill is not marked paid yet: mark {usd(ctx.amountCents)} received
                    </label>
                  )}
                  <p className="text-small text-slate-500">
                    {ctx.termLabel} · {ctx.installmentsPaid} of {ctx.cycles} bills paid stay as recorded.
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-1 text-small text-slate-400">
                  Start from the real first day
                  <Hint label="What the plan builder does">
                    Pick when the first 28-day cycle began (a past day is fine), the weekly time, how many bills are paid and which classes were already taught. The timeline below is exactly what will happen. Nothing changes until you press Apply.
                  </Hint>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-small font-medium text-slate-200">Cycle 1 started on</span>
                    <input type="date" value={startDate} max={todayEt()} onChange={(e) => setStartDate(e.target.value)} className={`${field} w-full`} />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-small font-medium text-slate-200">Weekly time</span>
                    <select value={slotKey} onChange={(e) => setSlotKey(e.target.value)} className={`${field} w-full`}>
                      {ctx.choices.map((c) => (
                        <option key={`${c.scheduleId}:${c.chunkIndex}`} value={`${c.scheduleId}:${c.chunkIndex}`}>
                          {DAYS[c.dayOfWeek]} {timeLabel(c.startTime)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <span className="mb-1 block text-small font-medium text-slate-200">Plan length</span>
                    <div className="flex gap-1.5">
                      {ctx.terms.map((t) => (
                        <button
                          key={t.term}
                          type="button"
                          onClick={() => {
                            setTerm(t.term);
                            setPaid((p) => Math.min(p, t.cycles));
                          }}
                          className={`tap flex-1 rounded-lg px-2 py-2 text-small font-medium ${term === t.term ? "bg-signal text-slate-950" : "bg-neu-base text-slate-200 shadow-raised-low"}`}
                        >
                          {t.cycles === 1 ? "1 mo" : `${t.cycles} mo`}
                        </button>
                      ))}
                    </div>
                    {termInfo && <p className="mt-1 text-small text-slate-500">{usd(termInfo.amountCents)} every 28 days</p>}
                  </div>
                  <div>
                    <span className="mb-1 block text-small font-medium text-slate-200">Bills paid</span>
                    <div className="flex items-center gap-2">
                      <button type="button" aria-label="One fewer" onClick={() => setPaid((p) => Math.max(1, p - 1))} className="tap h-11 w-11 rounded-xl bg-neu-base text-title text-slate-200 shadow-raised-low">-</button>
                      <span className="min-w-10 text-center text-body font-semibold tabular-nums text-slate-50">{paid} of {cycles}</span>
                      <button type="button" aria-label="One more" onClick={() => setPaid((p) => Math.min(cycles, p + 1))} className="tap h-11 w-11 rounded-xl bg-neu-base text-title text-slate-200 shadow-raised-low">+</button>
                    </div>
                  </div>
                </div>
                <div>
                  <span className="mb-1 flex items-center gap-1 text-small font-medium text-slate-200">
                    Classes already taught
                    <Hint label="About taught classes">Each one is marked present, counts as one of the cycle&apos;s 4 classes, and (if ticked below) spends a class credit.</Hint>
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    {taught.map((d) => (
                      <span key={d} className="inline-flex items-center gap-1 rounded-lg bg-emerald-400/15 px-2.5 py-1 text-small text-emerald-300">
                        {dateLabel(d)}
                        <button type="button" aria-label={`Remove ${d}`} onClick={() => setTaught((t) => t.filter((x) => x !== d))}>
                          <X aria-hidden className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    ))}
                    <input type="date" aria-label="A day already taught" value={taughtInput} max={todayEt()} onChange={(e) => setTaughtInput(e.target.value)} className={field} />
                    <button
                      type="button"
                      disabled={!taughtInput || taught.includes(taughtInput)}
                      onClick={() => {
                        setTaught((t) => [...t, taughtInput].sort());
                        setTaughtInput("");
                      }}
                      className="tap inline-flex h-11 items-center gap-1 rounded-xl bg-neu-base px-3 text-small font-medium text-slate-100 shadow-raised-low disabled:opacity-50"
                    >
                      <Plus aria-hidden className="h-3.5 w-3.5" />
                      Add
                    </button>
                  </div>
                  {taught.length > 0 && (
                    <label className="mt-2 flex items-center gap-2 text-small text-slate-300">
                      <input type="checkbox" checked={charge} onChange={(e) => setCharge(e.target.checked)} className="h-4 w-4 accent-signal" />
                      Spend a class credit for each
                    </label>
                  )}
                </div>
              </>
            )}

            {error && <p role="alert" className="text-small text-red-400">{error}</p>}

            {preview && (
              <div className="rounded-xl bg-neu-base p-3 shadow-pressed-low">
                <p className="text-small font-semibold text-slate-50">
                  {preview.nextBill ? `Next bill ${dateLabel(preview.nextBill)}` : "Every bill is paid"}
                  <span className="font-normal text-slate-500">
                    {" "}
                    · {preview.timeline.taughtCount} taught · {preview.timeline.bookedCount} booked
                    {preview.creditsGiven > 0 ? ` · +${preview.creditsGiven / 2} credits` : ""}
                    {preview.creditsCharged > 0 ? ` · -${preview.creditsCharged / 2} used` : ""}
                  </span>
                </p>
                {preview.alreadyMarked.length > 0 && (
                  <p className="mt-1 text-small text-amber-300">
                    {preview.alreadyMarked.map(dateLabel).join(", ")} is already marked present on the account, so it will not be charged again.
                  </p>
                )}
                <div className="mt-2 space-y-2">
                  <ViewMore items={preview.timeline.cycles} initial={2} step={6}>
                    {(c) => (
                      <div key={c.number}>
                        <p className="text-small text-slate-400">
                          Cycle {c.number} · {dateLabel(c.startsOn)} to {dateLabel(c.endsOn)} · {c.paid ? "paid" : "not paid"}
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {c.classes.map((k) => (
                            <span key={k.date} className={`rounded-lg px-2 py-1 text-small leading-tight ${STATE[k.state].cls}`} title={STATE[k.state].label}>
                              {dateLabel(k.date)} · {STATE[k.state].label}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </ViewMore>
                </div>
              </div>
            )}
          </div>
        )}
      </Dialog>
    </>
  );
}
