"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { NotifyToggle, useNotifyStudent } from "@/components/admin/NotifyToggle";
import { CalendarPlus } from "@/components/ui/appIcons";
import { Dialog } from "@/components/ui/Dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Hint } from "@/components/ui/Hint";
import { toast } from "@/components/ui/Toaster";
import { newIdempotencyKey } from "@/lib/idempotencyClient";
import { planSetupApplyAction, planSetupContextAction, planSetupPreviewAction } from "@/app/(dashboard)/admin/payment-plans/actions";
import type { PlanSetupContext, PlanSetupInput, PlanSetupPreview } from "@/lib/planSetup";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const usd = (cents: number) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
const shortDate = (ymd: string) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const longDate = (ymd: string) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });
const todayEt = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const dayNumber = (ymd: string) => Math.round(Date.parse(`${ymd}T00:00:00Z`) / 86_400_000);
/** Which calendar week (Sunday to Saturday) a date falls in, counted from this one: 0 this week, 1 next week. */
const weeksAhead = (ymd: string) => {
  const today = dayNumber(todayEt());
  const sunday = today - new Date(`${todayEt()}T00:00:00Z`).getUTCDay();
  return Math.floor((dayNumber(ymd) - sunday) / 7);
};
const weekLabel = (ymd: string) => {
  if (ymd === todayEt()) return "Today";
  const k = weeksAhead(ymd);
  return k <= 0 ? "This week" : k === 1 ? "Next week" : `In ${k} weeks`;
};

type ScholarshipPick = "keep" | "full" | "percent";

/**
 * "Set up plan" (owner only, first in the student page's Plan menu): weekly time, first class and scholarship in one step. A full
 * scholarship puts them on the 6 Month plan at $0, where every bill settles by itself, so they are a regular subscriber who never pays.
 * The steps it will take show before anything changes. See src/lib/planSetup.ts.
 */
export function AdminPlanSetupButton({ userId, compact = false }: { userId: string; compact?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notify, setNotify] = useNotifyStudent("student-changes");
  const [ctx, setCtx] = useState<PlanSetupContext | null>(null);
  const [slotKey, setSlotKey] = useState("");
  const [firstClass, setFirstClass] = useState("");
  const [pick, setPick] = useState<ScholarshipPick>("keep");
  const [percent, setPercent] = useState("50");
  const [term, setTerm] = useState<PlanSetupInput["term"]>("TERM_6");
  const [preview, setPreview] = useState<PlanSetupPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState(() => newIdempotencyKey());

  async function openBox() {
    setOpen(true);
    setCtx(null);
    setPreview(null);
    setError(null);
    const result = await planSetupContextAction(userId).catch(() => ({ ok: false as const, error: "Could not load." }));
    if (!result.ok) {
      toast.warning(result.error);
      return setOpen(false);
    }
    const c = result.context;
    setCtx(c);
    const slot = c.slots.find((s) => s.key === c.plan?.slotKey) ?? c.slots[0];
    setSlotKey(slot?.key ?? "");
    setFirstClass(c.plan?.firstClass && slot?.dates.includes(c.plan.firstClass) ? c.plan.firstClass : (slot?.dates[0] ?? ""));
    setPick("keep");
    setTerm(c.plan && c.plan.term !== "TERM_12" ? c.plan.term : "TERM_6");
  }

  const slot = ctx?.slots.find((s) => s.key === slotKey) ?? null;

  function chooseSlot(next: string) {
    setSlotKey(next);
    const s = ctx?.slots.find((x) => x.key === next);
    // Keep the same week when the new time has a class that week; otherwise its first date.
    const week = slot ? slot.dates.indexOf(firstClass) : 0;
    setFirstClass(s ? (s.dates[Math.max(0, week)] ?? s.dates[0]) : "");
  }

  const scholarshipApplies = pick !== "keep" || (ctx?.scholarshipPercent ?? 0) > 0;
  const input = useMemo<PlanSetupInput | null>(() => {
    if (!ctx || ctx.blocked || !slot || !firstClass) return null;
    const scholarship = pick === "full" ? { kind: "full" as const } : pick === "percent" ? { kind: "percent" as const, percent: Number(percent) } : { kind: "keep" as const };
    return { userId, scheduleId: slot.scheduleId, chunkIndex: slot.chunkIndex, firstClassDate: firstClass, scholarship, term };
  }, [ctx, slot, firstClass, pick, percent, term, userId]);

  // What will happen follows the form, a moment after the last change.
  useEffect(() => {
    if (!open || !input) return;
    let live = true;
    const t = window.setTimeout(async () => {
      const result = await planSetupPreviewAction(input).catch(() => ({ ok: false as const, error: "Could not check the plan." }));
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
  }, [open, input]);

  async function apply() {
    if (!input || !preview) return;
    setBusy(true);
    const hold = await toast.held(
      "Setting up the plan",
      () => planSetupApplyAction(input, key, notify).catch(() => ({ ok: false, error: "Something went wrong. Check the plan before trying again." as string | null, result: undefined })),
      { mail: notify },
    );
    setBusy(false);
    if (hold.undone) return;
    const result = hold.value;
    if (!result.ok || !result.result) return setError(result.error ?? "Could not set up the plan.");
    const done = result.result;
    toast.success(`Plan set up. First class ${done.firstClass}.${done.priceCents === 0 ? " Nothing to pay." : done.mode !== "running" && !done.covered ? ` First bill ${usd(done.priceCents)} sent.` : ""}`);
    setKey(newIdempotencyKey());
    setOpen(false);
    router.refresh();
  }

  const field = "min-h-11 w-full min-w-0 rounded-xl bg-neu-base px-3.5 py-2 text-body text-slate-100 shadow-pressed-low";
  // Chips turn solid orange when picked; data-no-lens keeps the glass lens (attached while they are plain) from painting over that.
  const chip = (on: boolean) => `tap rounded-lg px-3 py-2 text-small font-medium ${on ? "bg-signal text-slate-950" : "bg-neu-base text-slate-200 shadow-raised-low"}`;
  const byDay = DAYS.map((day, i) => ({ day, items: (ctx?.slots ?? []).filter((s) => s.dayOfWeek === i) })).filter((g) => g.items.length > 0);
  const current = ctx?.scholarshipPercent ?? 0;
  const laterDates = slot?.dates.slice(4) ?? [];

  return (
    <>
      <button type="button" onClick={() => void openBox()} aria-haspopup="dialog" className={buttonVariants({ variant: "secondary", size: "sm", className: compact ? "h-8 px-2.5" : "" })}>
        <CalendarPlus aria-hidden className="mr-1.5 h-3.5 w-3.5" />
        Set up plan
      </button>
      <Dialog
        open={open}
        onOpenChange={(next) => !busy && setOpen(next)}
        title={ctx ? `Set up a plan for ${ctx.studentName}` : "Set up plan"}
        footer={
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:items-center sm:justify-end">
            <NotifyToggle on={notify} onChange={setNotify} className="col-span-2 sm:mr-auto" />
            <Button type="button" variant="secondary" disabled={busy} onClick={() => setOpen(false)} className="w-full sm:w-auto">
              Never mind
            </Button>
            <Button type="button" disabled={!preview || busy || Boolean(ctx?.blocked)} loading={busy} onClick={apply} className="w-full sm:w-auto">
              Set up plan
            </Button>
          </div>
        }
      >
        {!ctx ? (
          <p className="text-small text-slate-500">Loading…</p>
        ) : ctx.blocked ? (
          <p role="alert" className="text-small text-amber-300">{ctx.blocked}</p>
        ) : ctx.slots.length === 0 ? (
          <p className="text-small text-slate-300">No weekly time is free. Add one on Classes &gt; Schedule first.</p>
        ) : (
          <div className="space-y-4">
            {ctx.plan && (
              <p className="text-small text-slate-400">
                Now: {ctx.plan.label}, {ctx.plan.priceCents === 0 ? "$0.00" : `${usd(ctx.plan.priceCents)} every 28 days`}, {ctx.plan.installmentsPaid} of {ctx.plan.termMonths} bills paid.
              </p>
            )}

            <label className="block">
              <span className="mb-1 block text-small font-medium text-slate-200">Weekly time</span>
              <select value={slotKey} onChange={(e) => chooseSlot(e.target.value)} className={field}>
                {byDay.map((g) => (
                  <optgroup key={g.day} label={g.day}>
                    {g.items.map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.label}
                        {s.key === ctx.plan?.slotKey ? " (now)" : ""}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>

            {slot && (
              <div>
                <span className="mb-1 flex items-center gap-1 text-small font-medium text-slate-200">
                  First class
                  <Hint label="About the first class">Nothing is booked before it. A running plan&apos;s next bill and credits move out by the weeks skipped, so no paid class is lost.</Hint>
                </span>
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                  {slot.dates.slice(0, 4).map((d) => (
                    <button key={d} type="button" data-no-lens="" aria-pressed={firstClass === d} onClick={() => setFirstClass(d)} className={`${chip(firstClass === d)} flex flex-col items-start`}>
                      <span>{weekLabel(d)}</span>
                      <span className={`text-caption ${firstClass === d ? "text-slate-950/80" : "text-slate-400"}`}>{shortDate(d)}</span>
                    </button>
                  ))}
                </div>
                {laterDates.length > 0 && (
                  <select aria-label="A later week" value={laterDates.includes(firstClass) ? firstClass : ""} onChange={(e) => e.target.value && setFirstClass(e.target.value)} className={`${field} mt-1.5`}>
                    <option value="">A later week…</option>
                    {laterDates.map((d) => (
                      <option key={d} value={d}>
                        {weekLabel(d)}, {shortDate(d)}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            <div>
              <span className="mb-1 flex items-center gap-1 text-small font-medium text-slate-200">
                Scholarship
                <Hint label="About scholarships">A scholarship takes a percent off the 6 Month plan, so it always means 6 Months. Full makes every bill $0: each one settles by itself and they get their credits and classes like any subscriber. It is recorded on Billing &gt; Scholarships, where it can be ended.</Hint>
              </span>
              <div className="flex flex-wrap gap-1.5">
                <button type="button" data-no-lens="" aria-pressed={pick === "keep"} onClick={() => setPick("keep")} className={chip(pick === "keep")}>
                  {current > 0 ? `Keep ${current}%` : "None"}
                </button>
                {current < 100 && (
                  <>
                    <button type="button" data-no-lens="" aria-pressed={pick === "full"} onClick={() => setPick("full")} className={chip(pick === "full")}>
                      Full (free)
                    </button>
                    <button type="button" data-no-lens="" aria-pressed={pick === "percent"} onClick={() => setPick("percent")} className={chip(pick === "percent")}>
                      Part
                    </button>
                  </>
                )}
              </div>
              {pick === "percent" && (
                <label className="mt-1.5 flex items-center gap-2 text-small text-slate-300">
                  <input type="number" inputMode="numeric" min={Math.max(1, current + 1)} max={99} value={percent} onChange={(e) => setPercent(e.target.value)} className={`${field} w-24`} />
                  percent off the 6 Month plan
                </label>
              )}
            </div>

            {scholarshipApplies ? (
              <p className="text-small text-slate-400">Plan length: 6 Months (the plan a scholarship covers).</p>
            ) : (
              <div>
                <span className="mb-1 block text-small font-medium text-slate-200">Plan length</span>
                <div className="flex gap-1.5">
                  {ctx.terms.map((t) => (
                    <button key={t.term} type="button" data-no-lens="" aria-pressed={term === t.term} onClick={() => setTerm(t.term)} className={`${chip(term === t.term)} flex-1`}>
                      {t.term === "MONTHLY" ? "1 mo" : t.term === "TERM_3" ? "3 mo" : "6 mo"}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {error && <p role="alert" className="text-small text-red-400">{error}</p>}

            {preview && (
              <div className="rounded-xl bg-neu-base p-3 shadow-pressed-low">
                <p className="text-small font-semibold text-slate-50">
                  {preview.priceCents === 0 ? "Free, covered by the scholarship" : `${usd(preview.priceCents)} every 28 days`}
                  <span className="font-normal text-slate-500"> · {preview.nextBill ? `next bill ${longDate(preview.nextBill)}` : "first bill to pay"}</span>
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {preview.classDates.map((d) => (
                    <span key={d} className="rounded-lg bg-signal/16 px-2 py-1 text-caption text-signal-fg">
                      {shortDate(d)}
                    </span>
                  ))}
                </div>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-small text-slate-300">
                  {preview.steps.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Dialog>
    </>
  );
}
