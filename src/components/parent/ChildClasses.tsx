"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, MoveRight, X } from "@/components/ui/appIcons";
import { Dialog } from "@/components/ui/Dialog";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { buttonVariants } from "@/components/ui/button";
import { toast } from "@/components/ui/Toaster";
import { formatDateTime } from "@/lib/classScheduleLabels";
import type { ChildClass } from "@/lib/parentChildren";
import { childOpenSlotsAction, parentBookClassAction, parentCancelClassAction, parentMoveClassAction, type OpenClassSlot } from "@/app/(dashboard)/parent/actions";
import { Hint } from "@/components/ui/Hint";

/** A child's classes: what is coming (move or cancel each), what has passed, and booking another with their credits. */
export function ChildClasses({ childId, upcoming, recent, creditsLabel }: { childId: string; upcoming: ChildClass[]; recent: ChildClass[]; creditsLabel: string }) {
  const router = useRouter();
  // null: closed. "book": a new class. A class id: moving that class.
  const [picking, setPicking] = useState<"book" | string | null>(null);
  const [slots, setSlots] = useState<OpenClassSlot[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [sure, setSure] = useState<string | null>(null);

  async function openPicker(target: "book" | string) {
    setPicking(target);
    setSlots(null);
    const result = await childOpenSlotsAction(childId).catch(() => ({ ok: false as const, error: "Could not load the times." }));
    if (!result.ok) {
      toast.warning(result.error);
      return setPicking(null);
    }
    setSlots(result.slots);
  }

  async function choose(slot: OpenClassSlot) {
    if (!picking) return;
    const key = `${slot.scheduleId}:${slot.occurrenceDateMs}:${slot.chunkIndex}`;
    setBusy(key);
    const result = await (picking === "book"
      ? parentBookClassAction(childId, slot.scheduleId, slot.occurrenceDateMs, slot.chunkIndex)
      : parentMoveClassAction(childId, picking, slot.scheduleId, slot.occurrenceDateMs, slot.chunkIndex)
    ).catch(() => ({ ok: false as const, error: "Something went wrong. Try again." }));
    setBusy(null);
    if (!result.ok) return void toast.warning(result.error);
    toast.success(picking === "book" ? "Class booked" : "Class moved");
    setPicking(null);
    router.refresh();
  }

  async function cancel(id: string) {
    if (sure !== id) return setSure(id);
    setBusy(id);
    const hold = await toast.held("Canceling the class", () => parentCancelClassAction(childId, id).catch(() => ({ ok: false as const, error: "Something went wrong. Try again." })), { mail: true });
    setBusy(null);
    setSure(null);
    if (hold.undone) return;
    const result = hold.value;
    if (!result.ok) return void toast.warning(result.error);
    toast.success("Class canceled");
    router.refresh();
  }

  return (
    <section className="mt-6" aria-label="Classes">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-small text-slate-500">
          Credits <span className="font-medium tabular-nums text-slate-100">{creditsLabel}</span>
        </p>
        <button type="button" onClick={() => void openPicker("book")} className={buttonVariants({ variant: "primary", size: "sm" })}>
          <CalendarPlus aria-hidden className="mr-1.5 h-4 w-4" />
          Book a class
        </button>
      </div>

      {upcoming.length === 0 ? (
        <p className="mt-3 rounded-2xl bg-neu-base p-5 text-small text-slate-500 shadow-raised-low">No classes coming up.</p>
      ) : (
        // Rows, not boxes: the day and time to read, and the two changes quiet beside it (cancel in red, still two taps).
        <ul className="mt-3 divide-y divide-slate-50/8 rounded-card bg-neu-base px-4 shadow-raised-low md:px-5" aria-label="Upcoming classes">
          {upcoming.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-3">
              <div className="min-w-0">
                <p className="text-body font-semibold tabular-nums text-slate-50">{formatDateTime(c.scheduledAt)}</p>
                {c.label && <p className="truncate text-small text-slate-500">{c.label}</p>}
              </div>
              <div className="-mr-2 flex shrink-0 gap-1">
                <button type="button" onClick={() => void openPicker(c.id)} aria-label={`Move the ${formatDateTime(c.scheduledAt)} class`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                  <MoveRight aria-hidden className="mr-1.5 h-3.5 w-3.5" />
                  Move
                </button>
                <button type="button" onClick={() => void cancel(c.id)} disabled={busy === c.id} aria-label={sure === c.id ? "Tap again to cancel this class" : `Cancel the ${formatDateTime(c.scheduledAt)} class`} className={buttonVariants({ variant: sure === c.id ? "danger" : "ghost", size: "sm", className: sure === c.id ? undefined : "text-red-300 hover:text-red-200" })}>
                  {busy === c.id ? <MorphingSquare size={12} className="mr-1.5" /> : <X aria-hidden className="mr-1.5 h-3.5 w-3.5" />}
                  {sure === c.id ? "Sure?" : "Cancel"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {recent.length > 0 && (
        <div className="mt-6">
          <h3 className="px-1 text-small font-semibold uppercase tracking-caps text-slate-400">Recent</h3>
          <ul className="mt-2 divide-y divide-slate-50/8 px-1" aria-label="Recent classes">
            {recent.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2.5 text-small">
                <span className="tabular-nums text-slate-300">{formatDateTime(c.scheduledAt)}</span>
                {/* Attended is the healthy state, so it stays a quiet word; a missed class carries the colour. */}
                <span className={c.attended === false ? "font-medium text-amber-300" : "text-slate-500"}>{c.attended === true ? "Attended" : c.attended === false ? "Missed" : "Not marked"}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Dialog open={picking !== null} onOpenChange={(open) => busy === null && !open && setPicking(null)} title={picking === "book" ? "Book a class for them" : "Move the class to"}>
        {slots === null ? (
          <div className="flex justify-center py-6">
            <MorphingSquare size={20} />
          </div>
        ) : slots.length === 0 ? (
          <p className="text-small text-slate-400"><Hint>No open class times right now.</Hint></p>
        ) : (
          <ul className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
            {slots.map((slot) => {
              const key = `${slot.scheduleId}:${slot.occurrenceDateMs}:${slot.chunkIndex}`;
              return (
                <li key={key}>
                  <button type="button" disabled={busy !== null} onClick={() => void choose(slot)} className="tap flex w-full items-center justify-between rounded-control bg-neu-base px-4 py-2.5 text-left text-small text-slate-200 shadow-raised-low transition hover:text-slate-50 active:shadow-pressed-low disabled:opacity-60">
                    <span>{formatDateTime(slot.scheduledAt)}</span>
                    {busy === key && <MorphingSquare size={12} />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Dialog>
    </section>
  );
}
