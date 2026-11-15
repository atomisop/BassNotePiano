import type { ReactNode } from "react";

/**
 * The one title on a sign-in screen (log in, create account, reset, verify), with at most one quiet line under it.
 * These screens are forms (DESIGN.md, "Band, sheet and tiles": never a band on a form), so the title is a calm headline and
 * there is no eyebrow over it: the brand lockup above the card already says where you are, and the button says what happens.
 */
export function AuthHeading({ title, children }: { title: string; children?: ReactNode }) {
  // The 21st.dev "Liquid Glass Login" header: a centred 28px semibold title with tight tracking and a soft text shadow, and a quiet
  // line under it (lgx-auth-title / lgx-auth-subtitle in globals.css).
  return (
    <header className="text-center">
      <h1 className="lgx-auth-title text-balance text-slate-50">{title}</h1>
      {children && <p className="lgx-auth-subtitle mt-1.5 text-pretty">{children}</p>}
    </header>
  );
}
