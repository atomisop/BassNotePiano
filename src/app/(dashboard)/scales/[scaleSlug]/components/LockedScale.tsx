"use client";

import Link from "next/link";
import { useState } from "react";
import { Card, Eyebrow } from "@/components/ui/Card";
import { buttonVariants } from "@/components/ui/button";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { openAtomWithCase } from "@/lib/atomTrigger";
import { cn } from "@/lib/utils";
import type { LockedScaleMessage } from "@/lib/lockedScale";
import { askForScaleUnlockAction } from "../lockedActions";

/** Shown in place of a scale the student cannot open yet, saying why and what to do. */
export function LockedScale({ scaleLabel, scaleSlug, message }: { scaleLabel: string; scaleSlug: string; message: LockedScaleMessage }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask() {
    setBusy(true);
    setError(null);
    try {
      const result = await askForScaleUnlockAction(scaleSlug);
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
    <div className="mx-auto max-w-xl py-10">
      <Card>
        <Eyebrow>{scaleLabel}</Eyebrow>
        <h1 className="mt-2 text-body font-semibold text-slate-50">{message.heading}</h1>
        {message.lines.map((line) => (
          <p key={line} className="mt-2 text-small text-slate-400">
            {line}
          </p>
        ))}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          {message.primary && (
            <Link href={message.primary.href} className={cn(buttonVariants())}>
              {message.primary.label}
            </Link>
          )}
          {message.canAsk && (
            <button
              type="button"
              onClick={ask}
              disabled={busy}
              className="tap inline-flex items-center justify-center gap-2 rounded-xl bg-neu-base px-4 py-2.5 text-small font-semibold text-slate-100 shadow-raised-low transition hover:shadow-raised-mid active:shadow-pressed-low disabled:opacity-60"
            >
              {busy && <MorphingSquare size={13} className="shrink-0" />}
              Ask my teacher to release it
            </button>
          )}
        </div>
        {error && (
          <p role="alert" className="mt-3 text-small text-red-400">
            {error}
          </p>
        )}
      </Card>
    </div>
  );
}
