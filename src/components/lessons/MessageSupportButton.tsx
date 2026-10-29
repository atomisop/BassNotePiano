"use client";

import { useState } from "react";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { openAtomWithCase } from "@/lib/atomTrigger";
import { contactSupportAboutBookingAction, contactSupportAboutBookingProblemAction } from "@/app/(dashboard)/lessons/actions";

/**
 * "Message support" on a booked class. Opens a support case with the subject
 * Booking under the student's own name and shows it in the support chat, so the
 * team knows exactly which class this is about. It no longer drops the student
 * into the general message screen.
 */
export function MessageSupportButton({
  bookingId,
  problem,
  className,
  label = "Message support",
}: {
  /** A booked class this is about. */
  bookingId?: string;
  /** Or: what went wrong, quoted to the team (the error the student just saw). */
  problem?: string;
  className?: string;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = bookingId ? await contactSupportAboutBookingAction(bookingId) : await contactSupportAboutBookingProblemAction(problem ?? "");
      if (!result.ok) {
        setError(result.error);
        return;
      }
      openAtomWithCase(result.escalationId);
    } catch {
      setError("That didn't go through. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        className={
          className ??
          "tap inline-flex items-center rounded-lg px-3 py-1.5 text-small font-medium text-slate-300 transition hover:text-slate-50 bg-neu-base shadow-raised-low hover:shadow-raised-mid active:shadow-pressed-low disabled:opacity-60"
        }
      >
        {busy && <MorphingSquare size={12} className="mr-1.5 shrink-0" />}
        {label}
      </button>
      {error && (
        <span role="alert" className="basis-full text-small text-red-400">
          {error}
        </span>
      )}
    </>
  );
}
