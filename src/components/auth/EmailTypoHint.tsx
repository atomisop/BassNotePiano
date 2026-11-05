"use client";

import { suggestEmailFix } from "@/lib/emailTypos";

/**
 * One quiet line under an email field: "Did you mean sam@gmail.com?" with the fixed address as a button that fills it in.
 * Shows only when the typed provider is one slip from a well-known one (see emailTypos.ts); nothing otherwise, so the form
 * does not jump. It never changes the field by itself.
 */
export function EmailTypoHint({ value, onFix, className = "" }: { value: string; onFix: (fixed: string) => void; className?: string }) {
  const fixed = suggestEmailFix(value);
  if (!fixed) return null;
  return (
    <p className={`mt-1.5 text-small text-slate-400 ${className}`} aria-live="polite">
      Did you mean{" "}
      <button type="button" onClick={() => onFix(fixed)} className="tap inline-flex items-center font-semibold text-slate-100 underline underline-offset-4 hover:text-signal-fg">
        {fixed}
      </button>
      ?
    </p>
  );
}
