"use client";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Input } from "@/components/ui/input";
import { buttonVariants } from "@/components/ui/button";
import { twoStepBeginAction, twoStepConfirmAction, twoStepDisableAction, twoStepRegenerateAction } from "./actions";

/**
 * Admin two-step sign-in. Never mount this for a student (the page only passes `twoStep` to the admin).
 * Settings renders its content twice, so there are no DOM ids in here.
 */
export function AdminTwoStepCard({ enabled: initiallyEnabled, backupLeft }: { enabled: boolean; backupLeft: number }) {
  const [enabled, setEnabled] = useState(initiallyEnabled);
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [left, setLeft] = useState(backupLeft);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"idle" | "disable" | "regenerate">("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run<T>(work: () => Promise<{ ok: true } & T | { ok: false; error: string }>, done: (r: { ok: true } & T) => void) {
    setBusy(true);
    setError(null);
    const r = await work();
    setBusy(false);
    if (!r.ok) return setError(r.error);
    done(r);
  }

  const field = "mt-2 w-full max-w-xs";
  return (
    <div className="glass-surface p-6">
      <h2 className="text-title font-semibold text-slate-50">Two-step sign-in (admin)</h2>
      <div className="mt-4 space-y-3 text-small text-slate-300">
        {codes ? (
          <>
            <p className="font-medium text-slate-50">Save these backup codes now. They are shown only once.</p>
            <p>Each works one time if you lose your phone. Keep them somewhere safe that is not this phone, such as a password manager.</p>
            <ul className="grid max-w-xs grid-cols-2 gap-2 font-mono text-body text-slate-100">
              {codes.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            <button type="button" onClick={() => setCodes(null)} className={buttonVariants({ variant: "primary", size: "sm" })}>
              I saved them
            </button>
          </>
        ) : enabled ? (
          <>
            <p>
              On. Signing in needs your password and a code from your authenticator app. Backup codes left: <strong className="text-slate-50">{left}</strong>.
            </p>
            {mode === "idle" && (
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setMode("regenerate")} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                  New backup codes
                </button>
                <button type="button" onClick={() => setMode("disable")} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                  Turn off
                </button>
              </div>
            )}
            {mode !== "idle" && (
              <div>
                {mode === "disable" && (
                  <Input type="password" autoComplete="current-password" placeholder="Your password" value={password} onChange={(e) => setPassword(e.target.value)} className={field} />
                )}
                <Input inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code from your app" value={code} onChange={(e) => setCode(e.target.value)} className={field} />
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    disabled={busy || !code.trim()}
                    onClick={() =>
                      mode === "disable"
                        ? run(() => twoStepDisableAction(password, code), () => {
                            setEnabled(false);
                            setMode("idle");
                            setCode("");
                            setPassword("");
                          })
                        : run(() => twoStepRegenerateAction(code), (r) => {
                            setCodes((r as unknown as { backupCodes: string[] }).backupCodes);
                            setLeft(8);
                            setMode("idle");
                            setCode("");
                          })
                    }
                    className={buttonVariants({ variant: "primary", size: "sm" })}
                  >
                    {mode === "disable" ? "Turn off two-step" : "Make new codes"}
                  </button>
                  <button type="button" onClick={() => { setMode("idle"); setError(null); }} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </>
        ) : setup ? (
          <>
            <p>1. Scan this with an authenticator app (Google Authenticator, 1Password, Authy), or type the key in by hand.</p>
            <div className="inline-block rounded-xl bg-white p-3">
              <QRCodeSVG value={setup.uri} size={160} />
            </div>
            <p className="break-all font-mono text-slate-100">{setup.secret}</p>
            <p>2. Type the 6-digit code the app shows, to prove it works.</p>
            <Input inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code" value={code} onChange={(e) => setCode(e.target.value)} className={field} />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy || !code.trim()}
                onClick={() =>
                  run(() => twoStepConfirmAction(code), (r) => {
                    setCodes((r as unknown as { backupCodes: string[] }).backupCodes);
                    setEnabled(true);
                    setLeft(8);
                    setSetup(null);
                    setCode("");
                  })
                }
                className={buttonVariants({ variant: "primary", size: "sm" })}
              >
                Turn on
              </button>
              <button type="button" onClick={() => { setSetup(null); setCode(""); setError(null); }} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <p>Off. Turn it on to also ask for an authenticator code when you sign in. Students are never asked.</p>
            <p className="text-slate-500">Before you rely on it, keep the backup codes it gives you. Without your phone and without those codes you cannot sign in.</p>
            <button
              type="button"
              disabled={busy}
              onClick={() => run(() => twoStepBeginAction(), (r) => setSetup(r as unknown as { secret: string; uri: string }))}
              className={buttonVariants({ variant: "secondary", size: "sm" })}
            >
              Set up
            </button>
          </>
        )}
        {error && <p role="alert" className="text-red-400">{error}</p>}
      </div>
    </div>
  );
}
