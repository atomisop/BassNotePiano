import Link from "next/link";
import type { AssistantEscalationStatus } from "@prisma/client";
import { getAssistantEscalations } from "@/lib/assistantEscalation";
import { AssistantEscalationQueue } from "@/components/admin/AssistantEscalationQueue";
import { resolveAssistantEscalationAction } from "./actions";

const FILTERS: { label: string; value: AssistantEscalationStatus | "ALL" }[] = [
  { label: "Open", value: "OPEN" },
  { label: "Resolved", value: "RESOLVED" },
  { label: "All", value: "ALL" },
];

export default async function AdminAssistantPage({ searchParams }: { searchParams: { status?: string } }) {
  const requested = searchParams.status?.toUpperCase();
  const activeFilter = FILTERS.find((f) => f.value === requested)?.value ?? "OPEN";
  const escalations = await getAssistantEscalations(activeFilter === "ALL" ? undefined : activeFilter);
  const activeLabel = FILTERS.find((f) => f.value === activeFilter)!.label;

  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-a-400)/0.8)]">Admin</p>
      <h1 className="mt-1.5 font-serif text-3xl text-slate-50">Atom handoffs</h1>
      <p className="mt-2 text-sm text-slate-500">
        {escalations.length} conversation{escalations.length === 1 ? "" : "s"} · {activeLabel.toLowerCase()} — when a visitor
        asks Atom to connect them with a person, their full chat history lands here.
      </p>

      <div className="mt-6 flex w-fit flex-wrap gap-1.5 rounded-full border border-ink/10 p-1">
        {FILTERS.map((filter) => (
          <Link
            key={filter.value}
            href={filter.value === "OPEN" ? "/admin/assistant" : `/admin/assistant?status=${filter.value}`}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
              activeFilter === filter.value ? "bg-[rgb(var(--c-a-400))] text-slate-950" : "text-slate-400 hover:text-slate-100"
            }`}
          >
            {filter.label}
          </Link>
        ))}
      </div>

      <div className="mt-6">
        <AssistantEscalationQueue
          escalations={escalations}
          onResolve={resolveAssistantEscalationAction}
          emptyMessage={activeFilter === "OPEN" ? "No open handoffs — Atom's handling things on its own." : `No ${activeLabel.toLowerCase()} handoffs.`}
        />
      </div>
    </div>
  );
}
