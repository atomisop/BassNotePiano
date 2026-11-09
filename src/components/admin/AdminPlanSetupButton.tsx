"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { NotifyToggle, useNotifyStudent } from "@/components/admin/NotifyToggle";
import { CalendarPlus } from "@/components/ui/appIcons";
import { Dialog } from "@/components/ui/Dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Hint } from "@/components/ui/Hint";
import { toast } from "@/components/ui/Toaster";
import { newIdempotencyKey } from "@/lib/idempotencyClient";
import { planSetupApplyAction, planSetupContextAction, planSetupPreviewAction, resumePlanAdminAction } from "@/app/(dashboard)/admin/payment-plans/actions";
import { planSetupTypedTimeAction } from "@/app/(dashboard)/admin/schedule/weeklyTimeActions";
import { liftPaymentLockAction } from "@/app/(dashboard)/admin/users/[userId]/actions";
import { approvePaymentAction, rejectPaymentAction } from "@/app/(dashboard)/admin/payments/actions";
import type { PlanSetupContext, PlanSetupFix, PlanSetupInput, PlanSetupPreview, PlanSetupSlot } from "@/lib/planSetup";
import { clashSummary, clashesFrom, firstClearDate, weekdayDay, type TypedWeeklyTime } from "@/lib/weeklyTimeRules";
import { ANOTHER_TIME, AnotherTimeFields, ClashMover, TimeFacts, choiceSuffix } from "@/components/admin/WeeklyTimeParts";

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

/** The window event that opens this dialog with a weekly time picked: `detail.slot` is "<scheduleId>:<chunkIndex>" (the `?do=setup&slot=` link). */
export const OPEN_PLAN_SETUP_EVENT = "bnp-open-plan-setup";

/**
 * "Set up plan" (owner only, first in the student page's Plan menu): weekly time, first class and scholarship in one step. A full
 * scholarship puts them on the 6 Month plan at $0, where every bill settles by itself, so they are a regular subscriber who never pays.
 * The steps it will take show before anything changes. See src/lib/planSetup.ts.
 *
 * Nothing sends the owner elsewhere: a paused plan resumes, a payment lock lifts and a payment under review is approved or rejected right
 * here; a weekly time with someone else's class on it can start after that class or move it in place; "Another time…" types a time that
 * has no window yet; a time kept for a contact asks first; a lower scholarship is one confirmed step.
 */
export function AdminPlanSetupButton({ userId, compact = false }: { userId: string; compact?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notify, setNotify] = useNotifyStudent("student-changes");
  const [ctx, setCtx] = useState<PlanSetupContext | null>(null);
  /** Times typed with "Another time…" in this dialog, shown with the listed ones. */
  const [typed, setTyped] = useState<PlanSetupSlot[]>([]);
  const [slotKey, setSlotKey] = useState("");
  const [askingTime, setAskingTime] = useState(false);
  const [typingBusy, setTypingBusy] = useState(false);
  const [wantedNote, setWantedNote] = useState<string | null>(null);
  const [firstClass, setFirstClass] = useState("");
  const [pick, setPick] = useState<ScholarshipPick>("keep");
  const [percent, setPercent] = useState("50");
  const [replaceScholarship, setReplaceScholarship] = useState(false);
  const [takeHeld, setTakeHeld] = useState(false);
  const [term, setTerm] = useState<PlanSetupInput["term"]>("TERM_6");
  const [preview, setPreview] = useState<PlanSetupPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fixBusy, setFixBusy] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [key, setKey] = useState(() => newIdempotencyKey());

  const slots = useMemo(() => [...(ctx?.slots ?? []), ...typed.filter((t) => !(ctx?.slots ?? []).some((s) => s.key === t.key))], [ctx, typed]);
  const slot = slots.find((s) => s.key === slotKey) ?? null;

  /** Loads (or reloads) what the dialog starts from. `wanted` picks that weekly time when it is free for this person. */
  const load = useCallback(
    async (wanted?: string | null, keep = false) => {
      const result = await planSetupContextAction(userId).catch(() => ({ ok: false as const, error: "Could not load." }));
      if (!result.ok) {
        toast.warning(result.error);
        if (!keep) setOpen(false);
        return;
      }
      const c = result.context;
      setCtx(c);
      if (keep) return;
      const want = wanted ? c.slots.find((s) => s.key === wanted) : undefined;
      setWantedNote(wanted && !want ? "That weekly time is someone else's now, so it is not offered. Pick another." : null);
      const chosen = want ?? c.slots.find((s) => s.key === c.preferredSlotKey) ?? c.slots[0];
      setSlotKey(chosen?.key ?? "");
      setFirstClass(c.plan?.firstClass && chosen?.dates.includes(c.plan.firstClass) ? c.plan.firstClass : (chosen?.dates[0] ?? ""));
      setPick("keep");
      setReplaceScholarship(false);
      setTakeHeld(false);
      setTerm(c.plan && c.plan.term !== "TERM_12" ? c.plan.term : "TERM_6");
    },
    [userId],
  );

  const openBox = useCallback(
    async (wanted?: string | null) => {
      setOpen(true);
      setCtx(null);
      setTyped([]);
      setAskingTime(false);
      setPreview(null);
      setError(null);
      setRejectReason("");
      await load(wanted);
    },
    [load],
  );

  // The `?do=setup&slot=` link (a waitlist notice, a contact's held time) opens this with the time picked. The Plan menu stays mounted
  // while closed, so this listener is always there.
  useEffect(() => {
    // The slot comes as "scheduleId:chunkIndex" or as { scheduleId, chunkIndex } (the student page's ?do=setup&slot= handler).
    const onOpen = (e: Event) => {
      const raw = (e as CustomEvent<{ slot?: string | { scheduleId: string; chunkIndex: number } | null }>).detail?.slot;
      const key = typeof raw === "string" ? raw : raw && typeof raw.scheduleId === "string" ? `${raw.scheduleId}:${raw.chunkIndex}` : null;
      void openBox(key);
    };
    window.addEventListener(OPEN_PLAN_SETUP_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_PLAN_SETUP_EVENT, onOpen);
  }, [openBox]);

  function chooseSlot(next: string) {
    if (next === ANOTHER_TIME) return setAskingTime(true);
    setAskingTime(false);
    setTakeHeld(false);
    setSlotKey(next);
    const s = slots.find((x) => x.key === next);
    // Keep the same week when the new time has a class that week; otherwise its first date.
    const week = slot ? slot.dates.indexOf(firstClass) : 0;
    setFirstClass(s ? (s.dates[Math.max(0, week)] ?? s.dates[0]) : "");
  }

  async function pickTypedTime(time: TypedWeeklyTime) {
    setTypingBusy(true);
    const result = await planSetupTypedTimeAction(userId, time).catch(() => ({ ok: false as const, error: "Could not check that time." }));
    setTypingBusy(false);
    if (!result.ok) return void toast.warning(result.error);
    const s = result.slot;
    setTyped((list) => [...list.filter((x) => x.key !== s.key), s]);
    setAskingTime(false);
    setTakeHeld(false);
    setSlotKey(s.key);
    setFirstClass(firstClearDate(s.dates, s.clashes.map((c) => c.date)) ?? s.dates[0] ?? "");
  }

  const current = ctx?.scholarshipPercent ?? 0;
  const lowering = pick === "percent" && Number(percent) > 0 && Number(percent) < current;
  const scholarshipApplies = pick !== "keep" || current > 0;
  const heldForOther = Boolean(slot?.holds.some((h) => !h.mine));
  const blocking = slot ? clashesFrom(slot.clashes, firstClass) : [];
  const clearDate = slot ? firstClearDate(slot.dates, slot.clashes.map((c) => c.date)) : null;

  const input = useMemo<PlanSetupInput | null>(() => {
    if (!ctx || ctx.blocked || !slot || !firstClass || askingTime) return null;
    const scholarship =
      pick === "full" ? { kind: "full" as const } : pick === "percent" ? { kind: "percent" as const, percent: Number(percent), replace: replaceScholarship } : { kind: "keep" as const };
    return { userId, scheduleId: slot.scheduleId, chunkIndex: slot.chunkIndex, newTime: slot.newTime, firstClassDate: firstClass, scholarship, term };
  }, [ctx, slot, firstClass, pick, percent, replaceScholarship, term, userId, askingTime]);

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

  /** Clears the reason the tool is blocked, right here, then loads it again. */
  async function runFix(fix: PlanSetupFix, action: "go" | "approve" | "reject") {
    setFixBusy(true);
    let message: string | null = null;
    try {
      if (fix.kind === "resume") {
        const r = await resumePlanAdminAction(fix.planId, notify);
        if (!r.ok) message = r.error ?? "Could not resume the plan.";
      } else if (fix.kind === "unlock") {
        const r = await liftPaymentLockAction(userId);
        if (!r.ok) message = r.error;
      } else if (fix.kind === "review") {
        if (action === "reject") await rejectPaymentAction(fix.payment.id, rejectReason.trim() || "The studio could not match this payment.", notify);
        else await approvePaymentAction(fix.payment.id, notify);
      }
    } catch {
      message = "Something went wrong. Try again.";
    }
    setFixBusy(false);
    if (message) return void toast.warning(message);
    toast.success(fix.kind === "resume" ? "Plan resumed" : fix.kind === "unlock" ? "Payment lock lifted" : action === "reject" ? "Payment rejected" : "Payment approved");
    router.refresh();
    await load(null);
  }

  /** A class was moved out of the way: the choices load again, so the time shows as free (a typed time is checked again too). */
  async function afterClassMoved() {
    if (slot?.newTime) {
      const result = await planSetupTypedTimeAction(userId, slot.newTime).catch(() => null);
      if (result?.ok) setTyped((list) => list.map((x) => (x.key === result.slot.key ? result.slot : x)));
    }
    await load(null, true);
  }

  function openGroupTool() {
    setOpen(false);
    // The Group tool sits in the same Plan menu, mounted while closed; it opens on this event.
    window.setTimeout(() => window.dispatchEvent(new CustomEvent("bnp-open-group-tool")), 50);
  }

  const field = "min-h-11 w-full min-w-0 rounded-xl bg-neu-base px-3.5 py-2 text-body text-slate-100 shadow-pressed-low";
  // Chips turn solid orange when picked; data-no-lens keeps the glass lens (attached while they are plain) from painting over that.
  const chip = (on: boolean) => `tap rounded-lg px-3 py-2 text-small font-medium ${on ? "bg-signal text-slate-950" : "bg-neu-base text-slate-200 shadow-raised-low"}`;
  const byDay = DAYS.map((day, i) => ({ day, items: slots.filter((s) => s.dayOfWeek === i) })).filter((g) => g.items.length > 0);
  const laterDates = slot?.dates.slice(4) ?? [];
  const ready = Boolean(preview) && !busy && !ctx?.blocked && (!heldForOther || takeHeld) && (!lowering || replaceScholarship);

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
            <Button type="button" disabled={!ready} loading={busy} onClick={apply} className="w-full sm:w-auto">
              Set up plan
            </Button>
          </div>
        }
      >
        {!ctx ? (
          <p className="text-small text-slate-500">Loading…</p>
        ) : ctx.blocked ? (
          <div className="grid gap-3">
            <p role="alert" className="text-small text-amber-300">
              {ctx.blocked}
            </p>
            {ctx.fix?.kind === "resume" && (
              <div>
                <Button type="button" size="sm" loading={fixBusy} onClick={() => void runFix(ctx.fix!, "go")}>
                  Resume now
                </Button>
              </div>
            )}
            {ctx.fix?.kind === "unlock" && (
              <div>
                <Button type="button" size="sm" loading={fixBusy} onClick={() => void runFix(ctx.fix!, "go")}>
                  Lift lock
                </Button>
              </div>
            )}
            {ctx.fix?.kind === "review" && (
              <div className="grid gap-2 rounded-xl bg-neu-base p-3 shadow-pressed-low">
                <p className="text-small text-slate-200">
                  {usd(ctx.fix.payment.amountCents)}
                  {ctx.fix.payment.installmentNumber ? `, bill ${ctx.fix.payment.installmentNumber}` : ""}
                  {ctx.fix.payment.senderName ? ` from ${ctx.fix.payment.senderName}` : ""}
                  <span className="text-slate-500">
                    {" "}
                    · {ctx.fix.payment.method === "VENMO" ? "Venmo" : "Zelle"}
                    {ctx.fix.payment.submittedAt ? ` · sent ${new Date(ctx.fix.payment.submittedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" })}` : ""}
                  </span>
                </p>
                <input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} maxLength={200} placeholder="Reason, if you reject it" aria-label="Reason, if you reject it" className={field} />
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" loading={fixBusy} onClick={() => void runFix(ctx.fix!, "approve")}>
                    Approve
                  </Button>
                  <Button type="button" size="sm" variant="destructive" disabled={fixBusy} onClick={() => void runFix(ctx.fix!, "reject")}>
                    Reject
                  </Button>
                </div>
              </div>
            )}
            {ctx.fix?.kind === "group" && (
              <div>
                <Button type="button" size="sm" variant="secondary" onClick={openGroupTool}>
                  Open the Group tool
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {ctx.plan && (
              <p className="text-small text-slate-400">
                Now: {ctx.plan.label}, {ctx.plan.priceCents === 0 ? "$0.00" : `${usd(ctx.plan.priceCents)} every 28 days`}, {ctx.plan.installmentsPaid} of {ctx.plan.termMonths} bills paid.
              </p>
            )}
            {wantedNote && <p className="text-small text-amber-300">{wantedNote}</p>}

            <div>
              <label className="block">
                <span className="mb-1 block text-small font-medium text-slate-200">Weekly time</span>
                <select value={askingTime ? ANOTHER_TIME : slotKey} onChange={(e) => chooseSlot(e.target.value)} className={field}>
                  {slots.length === 0 && <option value="">No weekly time yet</option>}
                  {byDay.map((g) => (
                    <optgroup key={g.day} label={g.day}>
                      {g.items.map((s) => (
                        <option key={s.key} value={s.key}>
                          {s.label}
                          {s.key === ctx.plan?.slotKey ? " (now)" : ""}
                          {s.newTime ? " (new)" : ""}
                          {choiceSuffix(s, clashSummary)}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                  <option value={ANOTHER_TIME}>Another time…</option>
                </select>
              </label>
              {(askingTime || slots.length === 0) && <AnotherTimeFields onUse={(t) => void pickTypedTime(t)} busy={typingBusy} />}
              {slot && !askingTime && <TimeFacts holds={slot.holds} waiting={slot.waiting} isNew={Boolean(slot.newTime)} />}
              {slot && !askingTime && heldForOther && (
                <label className="mt-1.5 flex items-center gap-2 text-small text-slate-200">
                  <input type="checkbox" checked={takeHeld} onChange={(e) => setTakeHeld(e.target.checked)} className="h-4 w-4 accent-signal" />
                  Take it anyway (the hold stays on Contacts)
                </label>
              )}
            </div>

            {slot && !askingTime && (
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

            {slot && !askingTime && blocking.length > 0 && (
              <div className="grid gap-2 rounded-xl bg-amber-300/10 p-3">
                <p className="text-small font-medium text-amber-300">
                  {blocking.length === 1 ? "Someone has a class on this time from that week on." : "Some people have classes on this time from that week on."}
                </p>
                {clearDate && (
                  <div>
                    <Button type="button" size="sm" variant="secondary" onClick={() => setFirstClass(clearDate)}>
                      Start after {blocking.length === 1 ? "it" : "them"}: {weekdayDay(clearDate)}
                    </Button>
                  </div>
                )}
                <ul className="grid gap-2">
                  {blocking.map((c) => (
                    <ClashMover key={c.bookingId} clash={c} notify={notify} onMoved={() => void afterClassMoved()} />
                  ))}
                </ul>
              </div>
            )}
            {slot && !askingTime && blocking.length === 0 && slot.clashes.length > 0 && (
              <p className="text-small text-slate-400">{clashSummary(slot.clashes)} on this time, before the first class. Those classes stay as they are.</p>
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
                  <button type="button" data-no-lens="" aria-pressed={pick === "full"} onClick={() => setPick("full")} className={chip(pick === "full")}>
                    Full (free)
                  </button>
                )}
                <button type="button" data-no-lens="" aria-pressed={pick === "percent"} onClick={() => setPick("percent")} className={chip(pick === "percent")}>
                  {current > 0 ? "Another percent" : "Part"}
                </button>
              </div>
              {pick === "percent" && (
                <label className="mt-1.5 flex items-center gap-2 text-small text-slate-300">
                  <input type="number" inputMode="numeric" min={1} max={99} value={percent} onChange={(e) => setPercent(e.target.value)} className={`${field} w-24`} />
                  percent off the 6 Month plan
                </label>
              )}
              {lowering && (
                <label className="mt-1.5 flex items-center gap-2 text-small text-amber-300">
                  <input type="checkbox" checked={replaceScholarship} onChange={(e) => setReplaceScholarship(e.target.checked)} className="h-4 w-4 accent-signal" />
                  End the current {current}% and give {Number(percent)}%
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

            {error && blocking.length === 0 && (
              <p role="alert" className="text-small text-red-400">
                {error}
              </p>
            )}

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
