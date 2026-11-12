"use client";

import { useEffect, useState } from "react";
import { getProviders, signIn } from "next-auth/react";
import { buttonVariants } from "@/components/ui/button";
import { GOOGLE_REFUSAL_MESSAGE, type GoogleRefusal } from "@/lib/googleSignInMessages";

/**
 * "Continue with Google": shown only when the server has Google switched on (the provider list says so), so nothing appears until the
 * owner has set the keys. A refusal comes back to the sign-in screen as ?error=google_<reason> and is explained by GoogleRefusalNotice.
 */
export function GoogleSignInButton({ callbackUrl, label = "Continue with Google" }: { callbackUrl: string; label?: string }) {
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getProviders()
      .then((p) => {
        if (!cancelled) setEnabled(Boolean(p?.google));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (!enabled) return null;
  return (
    <div className="space-y-4">
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void signIn("google", { callbackUrl });
        }}
        className={buttonVariants({ variant: "secondary", className: "w-full" })}
      >
        <svg aria-hidden viewBox="0 0 24 24" className="mr-2 h-4 w-4">
          <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.9-5.5 3.9a6 6 0 1 1 0-12c1.9 0 3.2.8 3.9 1.5l2.7-2.6A9.6 9.6 0 0 0 12 2.4a9.6 9.6 0 1 0 0 19.2c5.5 0 9.2-3.9 9.2-9.3 0-.6-.1-1.1-.2-1.6H12Z" />
        </svg>
        {busy ? "Opening Google…" : label}
      </button>
      <div className="flex items-center gap-3 text-caption text-slate-500">
        <span className="h-px flex-1 bg-slate-50/10" />
        or with your email
        <span className="h-px flex-1 bg-slate-50/10" />
      </div>
    </div>
  );
}

/** The sentence for a Google sign-in that was turned away (the code comes back in ?error=). Nothing when the error is something else. */
export function GoogleRefusalNotice({ error }: { error: string | null }) {
  if (!error || !error.startsWith("google_")) return null;
  const reason = error.slice("google_".length) as GoogleRefusal;
  const message = GOOGLE_REFUSAL_MESSAGE[reason] ?? GOOGLE_REFUSAL_MESSAGE.failed;
  return (
    <p role="alert" className="mb-4 rounded-xl border border-red-500/50 bg-neu-base px-4 py-3 text-small font-semibold text-red-400 shadow-pressed-low">
      {message}
    </p>
  );
}
