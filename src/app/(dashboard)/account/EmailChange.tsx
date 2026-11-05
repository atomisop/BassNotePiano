"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { PasswordInput } from "@/components/ui/password-input";
import { chunkCode, CHUNKED_CODE_LENGTH } from "@/lib/codeChunks";
import { requestEmailChangeCodeAction, updateEmailAction } from "./actions";

const input =
  "h-11 w-full rounded-control border border-(--neu-edge) bg-neu-base px-3 py-2 text-body text-slate-100 shadow-pressed-low outline-none transition focus:border-signal/60 disabled:opacity-60";

/** Edit email, for every role: the new address gets a code, and the password is asked again. */
export function EmailChange({ currentEmail, verified, renderBadge }: { currentEmail: string; verified: boolean; renderBadge: (verified: boolean) => React.ReactNode }) {
  // Shown from here so the new address appears at once, without re-rendering the whole settings screen.
  const [shownEmail, setShownEmail] = useState(currentEmail);
  const [isVerified, setIsVerified] = useState(verified);
  const { update } = useSession();
  const [open, setOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [awaitingCode, setAwaitingCode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  function close() {
    setOpen(false);
    setAwaitingCode(false);
    setNewEmail("");
    setPassword("");
    setCode("");
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (!awaitingCode) {
        const sent = await requestEmailChangeCodeAction(password, newEmail);
        if (!sent.ok) return setError(sent.error);
        setAwaitingCode(true);
        return;
      }
      const result = await updateEmailAction(password, newEmail, code);
      if (!result.ok) return setError(result.error);
      setShownEmail(result.email);
      setIsVerified(true);
      setDone(result.email);
      close();
      await update();
    } catch {
      setError("That didn't go through. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const current = (
    <div className="flex flex-wrap items-center">
      <span className="text-small text-slate-100">{shownEmail}</span>
      {renderBadge(isVerified)}
    </div>
  );

  if (!open) {
    return (
      <div>
        {current}
        <div className="mt-3">
        <Button type="button" onClick={() => { setOpen(true); setDone(null); }} variant="secondary" size="sm">
          Edit email
        </Button>
        {done && <p className="mt-2 text-small text-slate-50">Email changed to {done}. Use it the next time you sign in.</p>}
        </div>
      </div>
    );
  }

  return (
    <div>
    {current}
    <form onSubmit={submit} className="mt-4 space-y-3">
      <input
        type="email"
        inputMode="email"
        autoComplete="email"
        placeholder="New email"
        required
        value={newEmail}
        onChange={(e) => setNewEmail(e.target.value)}
        disabled={busy || awaitingCode}
        className={input}
      />
      <PasswordInput
        placeholder="Current password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        disabled={busy || awaitingCode}
        className="w-full disabled:opacity-60"
      />
      {awaitingCode && (
        <div className="space-y-2">
          <p className="text-small text-slate-500">Enter the 6-digit code we sent to {newEmail.trim().toLowerCase()}.</p>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="6-digit code"
            maxLength={CHUNKED_CODE_LENGTH}
            autoFocus
            required
            value={chunkCode(code)}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            disabled={busy}
            className={`${input} text-center tracking-[0.4em]`}
          />
        </div>
      )}
      {error && <p role="alert" className="text-small text-red-400">{error}</p>}
      <div className="flex gap-2">
        <Button type="button" onClick={close} disabled={busy} variant="secondary" size="sm">
          Cancel
        </Button>
        <Button type="submit" disabled={busy || (awaitingCode && code.length !== 6)} variant="primary" size="sm">
          {busy && <MorphingSquare size={12} className="mr-1.5 shrink-0" />}
          {awaitingCode ? "Confirm new email" : "Send code"}
        </Button>
      </div>
    </form>
    </div>
  );
}
