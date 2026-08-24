"use client";

import { useState } from "react";
import { IndividualCreditsFlow } from "./IndividualCreditsFlow";
import { FamilyBundleFlow } from "./FamilyBundleFlow";

type Mode = "individual" | "family";

const MODES: { id: Mode; label: string }[] = [
  { id: "individual", label: "For my account" },
  { id: "family", label: "Family bundle (2+ kids)" },
];

/**
 * Thin mode switcher over the two actual purchase flows, kept separate
 * from each (IndividualCreditsFlow, FamilyBundleFlow) since they share
 * almost no state, just this one tab strip and the glass-surface card
 * they're both dropped into.
 */
export function ClassCreditPurchaseFlow({
  zelleHandle,
  initialQuantity,
  initialMode = "individual",
}: {
  zelleHandle: string;
  initialQuantity?: number;
  initialMode?: Mode;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);

  return (
    <div className="glass-surface space-y-6 p-6 sm:p-8">
      <div className="flex flex-col gap-2 rounded-xl border border-ink/10 bg-slate-950/30 p-1.5 sm:flex-row">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setMode(m.id)}
            className={`flex-1 rounded-lg px-3.5 py-2 text-sm font-medium transition ${
              mode === m.id ? "bg-[rgb(var(--c-a-400)/0.15)] text-[rgb(var(--c-a-200))]" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {mode === "family" && (
        <p className="rounded-xl border border-[rgb(var(--c-a-400)/0.2)] bg-[rgb(var(--c-a-400)/0.05)] px-3.5 py-2.5 text-xs text-[rgb(var(--c-a-200))]">
          Buying the same tier for 2 or more kids at once gets an extra 25% off the combined total, for a limited time.
          Every recipient needs their own Bass Note Piano account already, since credits go straight to them, not to you.
        </p>
      )}

      {mode === "individual" ? (
        <IndividualCreditsFlow zelleHandle={zelleHandle} initialQuantity={initialQuantity} />
      ) : (
        <FamilyBundleFlow zelleHandle={zelleHandle} />
      )}
    </div>
  );
}
