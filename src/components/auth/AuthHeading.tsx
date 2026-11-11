import type { ReactNode } from "react";

/**
 * The one title on a sign-in screen (log in, create account, reset, verify), with at most one quiet line under it.
 * These screens are forms (DESIGN.md, "Band, sheet and tiles": never a band on a form), so the title is a calm headline and
 * there is no eyebrow over it: the brand lockup above the card already says where you are, and the button says what happens.
 */
export function AuthHeading({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div>
      <h1 className="font-hero text-headline font-bold text-balance text-slate-50">{title}</h1>
      {children && <p className="mt-1.5 text-small text-slate-400">{children}</p>}
    </div>
  );
}
