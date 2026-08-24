"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminAssistantEscalation } from "@/lib/assistantEscalation";

export interface AssistantEscalationQueueProps {
  escalations: AdminAssistantEscalation[];
  onResolve: (escalationId: string) => Promise<void>;
  emptyMessage?: string;
}

const STATUS_LABEL: Record<string, string> = {
  OPEN: "Needs follow-up",
  RESOLVED: "Resolved",
};

const STATUS_STYLE: Record<string, string> = {
  OPEN: "bg-[rgb(var(--c-a-400)/0.15)] text-[rgb(var(--c-a-300))]",
  RESOLVED: "bg-emerald-400/15 text-emerald-300",
};

interface TranscriptTurn {
  role: "user" | "assistant";
  content: string;
}

/** The stored transcript is a Prisma Json column — narrow it defensively rather than trusting the shape blindly. */
function readTranscript(value: unknown): TranscriptTurn[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (m): m is TranscriptTurn =>
      typeof m === "object" &&
      m !== null &&
      ((m as { role: unknown }).role === "user" || (m as { role: unknown }).role === "assistant") &&
      typeof (m as { content: unknown }).content === "string",
  );
}

function TranscriptView({ turns }: { turns: TranscriptTurn[] }) {
  if (turns.length === 0) {
    return <p className="text-sm text-slate-600">No messages were captured with this handoff.</p>;
  }
  return (
    <div className="max-h-80 space-y-2 overflow-y-auto rounded-xl border border-ink/10 bg-slate-950/40 p-3">
      {turns.map((turn, i) => (
        <div key={i} className={`flex ${turn.role === "user" ? "justify-end" : "justify-start"}`}>
          <div
            className={`max-w-[85%] rounded-xl px-3 py-1.5 text-sm ${
              turn.role === "user" ? "bg-[rgb(var(--c-a-400)/0.18)] text-slate-100" : "border border-ink/10 bg-surface text-slate-300"
            }`}
          >
            <p className="whitespace-pre-wrap break-words">{turn.content}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export function AssistantEscalationQueue({ escalations, onResolve, emptyMessage = "No handoffs yet." }: AssistantEscalationQueueProps) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(escalations[0]?.id ?? null);

  async function handleResolve(id: string) {
    setBusyId(id);
    try {
      await onResolve(id);
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  if (escalations.length === 0) {
    return <div className="glass-surface p-8 text-center text-sm text-slate-500">{emptyMessage}</div>;
  }

  return (
    <div className="space-y-3">
      {escalations.map((esc) => {
        const turns = readTranscript(esc.transcript);
        const expanded = expandedId === esc.id;
        return (
          <div key={esc.id} className="glass-surface p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-serif text-lg text-slate-50">{esc.contactName || esc.contactEmail}</h3>
                <p className="mt-0.5 text-sm text-slate-500">
                  {esc.contactEmail}
                  {esc.user && (
                    <>
                      {" "}
                      · signed in{esc.user.username ? ` as @${esc.user.username}` : ""}
                    </>
                  )}
                </p>
              </div>
              <span className={`inline-block rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide ${STATUS_STYLE[esc.status]}`}>
                {STATUS_LABEL[esc.status]}
              </span>
            </div>

            <p className="mt-3 text-xs text-slate-600">
              Asked for help {new Date(esc.createdAt).toLocaleString()}
              {esc.status === "RESOLVED" && esc.resolvedBy && <> · resolved by {esc.resolvedBy.name ?? "an admin"}</>}
            </p>

            <button
              type="button"
              onClick={() => setExpandedId(expanded ? null : esc.id)}
              className="mt-3 text-xs font-medium text-[rgb(var(--c-a-300))] transition hover:text-[rgb(var(--c-a-200))]"
            >
              {expanded ? "Hide chat history" : `View chat history (${turns.length} message${turns.length === 1 ? "" : "s"})`}
            </button>

            {expanded && (
              <div className="mt-3">
                <TranscriptView turns={turns} />
              </div>
            )}

            {esc.status === "OPEN" && (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => handleResolve(esc.id)}
                  disabled={busyId === esc.id}
                  className="cta-sheen cta-fill rounded-lg px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busyId === esc.id ? "Marking resolved…" : "Mark resolved"}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
