"use client";

import { useEffect, useRef, useState } from "react";
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
export function ChildClasses({
  childId,
  upcoming,
  recent,
  creditsLabel,
  openMoveFor,
}: {
  childId: string;
  upcoming: ChildClass[];
  recent: ChildClass[];
  creditsLabel: string;
  /** A class to open the move picker for straight away (the child asked to move or skip it: /parent/<child>?move=<class>). */
  openMoveFor?: string | null;
}) {
  const router = useRouter();
  // null: closed. "book": a new class. A class id: moving that class.
  const [picking, setPicking] = useState<"book" | string | null>(null);
  const [slots, setSlots] = useState<OpenClassSlot[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [sure, setSure] = useState<string | null>(null);
  const [asked, setAsked] = useState<string | null>(null);

  // Opened from the child's "move or skip this" notice: that class's picker opens at once, and it is marked so Cancel is right there too.
  const handled = useRef(false);
  useEffect(() => {
    if (!openMoveFor || handled.current) return;
    handled.current = true;
    // The link has done its job: a reload should not open the picker again.
    window.history.replaceState(window.history.state, "", window.location.pathname);
    if (upcoming.some((c) => c.id === openMoveFor)) {
      setAsked(openMoveFor);
      void openPicker(openMoveFor);
    } else {
      toast.info("That class is no longer coming up.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, for the class the link named
  }, [openMoveFor]);

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
    await cancelNow(id);
  }

  // "Skip it" inside the picker the child's ask opened: its own second tap is the confirmation, then the picker closes and the class is canceled.
  const [skipSure, setSkipSure] = useState(false);
  async function skipFromPicker(id: string) {
    if (!skipSure) return setSkipSure(true);
    setSkipSure(false);
    setPicking(null);
    await cancelNow(id);
  }

  async function cancelNow(id: string) {
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
        <p className="text-small text-slate-400">
          Credits <span className="tabular-nums text-slate-50">{creditsLabel}</span>
        </p>
        <button type="button" onClick={() => void openPicker("book")} className={buttonVariants({ variant: "primary", size: "sm" })}>
          <CalendarPlus aria-hidden className="mr-1.5 h-4 w-4" />
          Book a class
        </button>
      </div>

      {upcoming.length === 0 ? (
        <p className="mt-3 rounded-2xl bg-neu-base p-5 text-small text-slate-500 shadow-raised-low">No classes coming up.</p>
      ) : (
        <ul className="mt-3 space-y-2" aria-label="Upcoming classes">
          {upcoming.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 rounded-2xl bg-neu-base p-4 shadow-raised-low">
              <div className="min-w-0">
                <p className="text-small font-medium text-slate-100">{formatDateTime(c.scheduledAt)}</p>
                {c.label && <p className="mt-0.5 truncate text-small text-slate-500">{c.label}</p>}
              </div>
              <div className="flex shrink-0 gap-2">
                <button type="button" onClick={() => void openPicker(c.id)} aria-label={`Move the ${formatDateTime(c.scheduledAt)} class`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                  <MoveRight aria-hidden className="mr-1.5 h-3.5 w-3.5" />
                  Move
                </button>
                <button type="button" onClick={() => void cancel(c.id)} disabled={busy === c.id} aria-label={sure === c.id ? "Tap again to cancel this class" : `Cancel the ${formatDateTime(c.scheduledAt)} class`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
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
          <h3 className="text-small font-medium text-slate-300">Recent</h3>
          <ul className="mt-2 divide-y divide-slate-50/10" aria-label="Recent classes">
            {recent.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2.5 text-small">
                <span className="text-slate-300">{formatDateTime(c.scheduledAt)}</span>
                <span className={c.attended === true ? "text-emerald-400" : c.attended === false ? "text-amber-300" : "text-slate-500"}>{c.attended === true ? "Attended" : c.attended === false ? "Missed" : "Not marked"}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Dialog
        open={picking !== null}
        onOpenChange={(open) => {
          if (busy !== null || open) return;
          setPicking(null);
          setSkipSure(false);
        }}
        title={picking === "book" ? "Book a class for them" : "Move the class to"}
      >
        {picking && picking !== "book" && picking === asked && (
          // Arrived from the child's "move or skip this": both answers are here, so nothing else has to be found.
          <div className="mb-4 flex flex-col gap-3 rounded-control bg-signal/10 p-3 text-small text-slate-200 ring-1 ring-inset ring-signal/20 sm:flex-row sm:items-center sm:justify-between">
            <p>They asked to move or skip this class. Pick a new time below, or skip it.</p>
            <button type="button" disabled={busy !== null} onClick={() => void skipFromPicker(picking)} className={buttonVariants({ variant: "secondary", size: "sm", className: "shrink-0" })}>
              <X aria-hidden className="h-3.5 w-3.5" />
              {skipSure ? "Tap again to skip" : "Skip this class"}
            </button>
          </div>
        )}
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
