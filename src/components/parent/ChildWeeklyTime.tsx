"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Check } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { buttonVariants } from "@/components/ui/button";
import { toast } from "@/components/ui/Toaster";
import { childWeeklyChoicesAction, parentEndChildPlanAction, parentMoveWeeklyTimeAction, type WeeklyChoice } from "@/app/(dashboard)/parent/actions";

/** Moves the child's whole plan to another weekly time: the standing day and hour and every class already booked on it. */
export function ChildWeeklyTime({ childId }: { childId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [current, setCurrent] = useState<string | null>(null);
  const [choices, setChoices] = useState<WeeklyChoice[]>([]);
  const [picked, setPicked] = useState<WeeklyChoice | null>(null);
  const [moving, setMoving] = useState(false);

  async function openBox() {
    setOpen(true);
    setPicked(null);
    setLoading(true);
    const result = await childWeeklyChoicesAction(childId).catch(() => ({ ok: false as const, error: "Could not load the times." }));
    setLoading(false);
    if (!result.ok) {
      toast.warning(result.error);
      return setOpen(false);
    }
    setCurrent(result.current);
    setChoices(result.choices);
  }

  async function move() {
    if (!picked) return;
    setMoving(true);
    const result = await parentMoveWeeklyTimeAction(childId, picked.scheduleId, picked.chunkIndex).catch(() => ({ ok: false as const, error: "Something went wrong. Try again." }));
    setMoving(false);
    if (!result.ok) return void toast.warning(result.error);
    toast.success(`Weekly time moved to ${picked.label}`);
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button type="button" onClick={() => void openBox()} aria-haspopup="dialog" className={buttonVariants({ variant: "secondary", size: "sm" })}>
        <CalendarClock aria-hidden className="mr-1.5 h-3.5 w-3.5" />
        Change weekly time
      </button>
      <Dialog open={open} onOpenChange={(next) => !moving && setOpen(next)} title="Move the weekly time to">
        {loading ? (
          <div className="flex justify-center py-6">
            <MorphingSquare size={20} />
          </div>
        ) : choices.length === 0 ? (
          <p className="text-small text-slate-400">No free weekly time to move to.</p>
        ) : (
          <>
            {current && <p className="mb-2 text-small text-slate-400">Now: {current}</p>}
            <ul className="max-h-72 space-y-1.5 overflow-y-auto pr-1" role="listbox" aria-label="Free weekly times">
              {choices.map((c) => {
                const on = picked?.scheduleId === c.scheduleId && picked.chunkIndex === c.chunkIndex;
                return (
                  <li key={`${c.scheduleId}:${c.chunkIndex}`}>
                    <button type="button" role="option" aria-selected={on} onClick={() => setPicked(c)} className={`tap flex w-full items-center justify-between rounded-control px-4 py-2.5 text-left text-small transition ${on ? "bg-[rgb(var(--signal)/0.16)] text-slate-50 ring-1 ring-signal" : "bg-neu-base text-slate-200 shadow-raised-low hover:text-slate-50"}`}>
                      {c.label}
                      {on && <Check aria-hidden className="h-4 w-4 text-signal-fg" />}
                    </button>
                  </li>
                );
              })}
            </ul>
            <button type="button" disabled={!picked || moving} onClick={() => void move()} aria-busy={moving} className={buttonVariants({ variant: "primary", className: "mt-4 w-full" })}>
              {moving && <MorphingSquare size={14} className="mr-2 shrink-0" />}
              Move all their classes
            </button>
          </>
        )}
      </Dialog>
    </>
  );
}

/** Ends the plan the parent pays for (two taps). The child keeps what is already paid for. */
export function EndChildPlanButton({ childId }: { childId: string }) {
  const router = useRouter();
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  async function end() {
    if (!sure) return setSure(true);
    setBusy(true);
    const result = await parentEndChildPlanAction(childId).catch(() => ({ ok: false as const, error: "Something went wrong. Try again." }));
    setBusy(false);
    setSure(false);
    if (!result.ok) return void toast.warning(result.error);
    toast.success("Plan ended");
    router.refresh();
  }
  return (
    <button type="button" onClick={() => void end()} disabled={busy} aria-label={sure ? "Tap again to end this plan" : "End this plan"} className={buttonVariants({ variant: "secondary", size: "sm" })}>
      {busy && <MorphingSquare size={12} className="mr-1.5" />}
      {sure ? "Sure? End the plan" : "End this plan"}
    </button>
  );
}
