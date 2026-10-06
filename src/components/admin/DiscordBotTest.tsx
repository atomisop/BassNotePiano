"use client";

import { useState } from "react";
import { MorphingSquare } from "@/components/ui/morphing-square";
import type { SetupCheck } from "@/lib/discordApi";

/** Owner-only: runs the bot through every step and shows which one fails. */
export function DiscordBotTest({ onRun }: { onRun: () => Promise<{ ok: boolean; checks: SetupCheck[] }> }) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; checks: SetupCheck[] } | null>(null);

  async function run() {
    setRunning(true);
    try {
      setResult(await onRun());
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="mt-6 rounded-2xl bg-neu-base p-4 shadow-raised-low">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-small font-semibold text-slate-50">Discord class calls</p>
        <div className="flex flex-wrap gap-2">
          <a href="/api/discord/connect" className="tap neu-btn inline-flex items-center rounded-lg px-3 py-1.5 text-small font-medium">
            Connect my Discord
          </a>
          <button type="button" onClick={run} disabled={running} className="tap neu-btn inline-flex items-center rounded-lg px-3 py-1.5 text-small font-medium">
            {running && <MorphingSquare size={12} className="mr-1.5 shrink-0" />}
            {running ? "Testing…" : "Test the bot"}
          </button>
        </div>
      </div>
      {result && (
        <ul className="mt-3 space-y-1.5">
          {result.checks.map((c) => (
            <li key={c.step} className="text-small">
              <span className={c.ok ? "text-slate-200" : "text-red-300"}>{c.ok ? "OK" : "Problem"}: {c.step}.</span>{" "}
              <span className="text-slate-500">{c.detail}</span>
            </li>
          ))}
          {result.ok && <li className="text-small text-slate-300">Everything works. Class calls will be made automatically.</li>}
        </ul>
      )}
    </div>
  );
}
