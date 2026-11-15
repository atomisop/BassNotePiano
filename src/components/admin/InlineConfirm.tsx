"use client";

import { buttonVariants } from "@/components/ui/button";
import { MorphingSquare } from "@/components/ui/morphing-square";

/**
 * The admin's own "are you sure" step, shown in place under the button that asked (the same look as the Ban confirmation), instead of
 * the browser's confirm box, which is plain, titled with the site's address on iPhone, and unlike every other confirm in the admin.
 */
export function InlineConfirm({
  question,
  detail,
  confirmLabel,
  busyLabel = "Working…",
  busy = false,
  danger = false,
  onCancel,
  onConfirm,
  className = "",
}: {
  question: string;
  detail?: string;
  confirmLabel: string;
  busyLabel?: string;
  busy?: boolean;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  className?: string;
}) {
  return (
    <div role="group" aria-label={question} className={`rounded-xl border bg-neu-base p-4 shadow-pressed-low ${danger ? "border-red-500/40" : "border-slate-50/15"} ${className}`}>
      <p className={`text-small font-semibold ${danger ? "text-red-300" : "text-slate-100"}`}>{question}</p>
      {detail && <p className="mt-1 text-small text-slate-300">{detail}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={onCancel} disabled={busy} className={buttonVariants({ variant: "secondary", size: "sm" })}>
          Not yet
        </button>
        <button type="button" onClick={onConfirm} disabled={busy} className={buttonVariants({ variant: danger ? "danger" : "primary", size: "sm", className: danger ? undefined : "text-black" })}>
          {busy && <MorphingSquare size={12} className="shrink-0" />}
          {busy ? busyLabel : confirmLabel}
        </button>
      </div>
    </div>
  );
}
