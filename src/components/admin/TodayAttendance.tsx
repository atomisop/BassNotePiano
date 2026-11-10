"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { StatusDot } from "@/components/ui/StatusDot";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { toast } from "@/components/ui/Toaster";
import { cn } from "@/lib/utils";
import { useNotifyStudent } from "@/components/admin/NotifyToggle";

type Mark = "PRESENT" | "NO_SHOW";

/**
 * Attendance right on the Today screen, so a teaching day never sends you to Schedule > Attendance: Present or No-show once the class
 * has started (marking charges the credit, as everywhere), and Undo for a mistaken mark (which refunds it).
 */
export function TodayAttendance({
  bookingId,
  name,
  attendance,
  started,
  onMark,
  onUndo,
}: {
  bookingId: string;
  name: string;
  attendance: Mark | null;
  /** The class has begun, so it can be marked. */
  started: boolean;
  onMark: (bookingId: string, attendance: Mark, notify?: boolean) => Promise<void>;
  onUndo: (bookingId: string, notify?: boolean) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const router = useRouter();
  // The "Notify students" switch at the top of the list (NotifyPlaceToggle place="attendance").
  const [notify] = useNotifyStudent("attendance");
  const [mark, setMark] = useState<Mark | null>(attendance);
  const [busy, setBusy] = useState<Mark | "undo" | null>(null);
  const [, startTransition] = useTransition();

  async function set(next: Mark) {
    setBusy(next);
    try {
      await onMark(bookingId, next, notify);
      setMark(next);
      toast.success(`${name}: ${next === "PRESENT" ? "present" : "no-show"}`);
      startTransition(() => router.refresh());
    } catch {
      toast.error("Could not save that. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function undo() {
    setBusy("undo");
    const result = await onUndo(bookingId, notify).catch(() => ({ ok: false as const, error: "Could not undo that. Try again." }));
    setBusy(null);
    if (!result.ok) return void toast.error(result.error);
    setMark(null);
    toast.success(`${name}: mark removed, credit back`);
    startTransition(() => router.refresh());
  }

  if (mark) {
    return (
      <div className="flex items-center gap-2">
        <StatusDot tone={mark === "PRESENT" ? "success" : "danger"}>{mark === "PRESENT" ? "Present" : "No-show"}</StatusDot>
        {/* Undo is the quiet way back from a slip, so it never looks like the next thing to do. */}
        <button type="button" onClick={() => void undo()} disabled={busy !== null} className={buttonVariants({ variant: "ghost", size: "sm", className: "text-slate-400" })}>
          {busy === "undo" && <MorphingSquare size={12} className="mr-1 shrink-0" />}
          Undo
        </button>
      </div>
    );
  }
  if (!started) return <span className="text-small text-slate-500">Not started</span>;
  return (
    <div className="flex items-center gap-2" role="group" aria-label={`Attendance for ${name}`}>
      <button type="button" onClick={() => void set("PRESENT")} disabled={busy !== null} className={buttonVariants({ variant: "secondary", size: "sm" })}>
        {busy === "PRESENT" && <MorphingSquare size={12} className="mr-1 shrink-0" />}
        Present
      </button>
      <button
        type="button"
        onClick={() => void set("NO_SHOW")}
        disabled={busy !== null}
        className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "text-red-300 hover:text-red-200")}
      >
        {busy === "NO_SHOW" && <MorphingSquare size={12} className="mr-1 shrink-0" />}
        No-show
      </button>
    </div>
  );
}
