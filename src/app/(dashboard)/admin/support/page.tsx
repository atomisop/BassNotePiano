import Link from "next/link";
import type { AssistantEscalationStatus } from "@prisma/client";
import { getSupportThreads } from "@/lib/support";
import { SupportChatPanel } from "@/components/admin/SupportChatPanel";

const FILTERS: { label: string; value: AssistantEscalationStatus | "ALL" }[] = [
  { label: "Open", value: "OPEN" },
  { label: "Resolved", value: "RESOLVED" },
  { label: "All", value: "ALL" },
];

export default async function AdminSupportPage({ searchParams }: { searchParams: { status?: string } }) {
  const requested = searchParams.status?.toUpperCase();
  const activeFilter = FILTERS.find((f) => f.value === requested)?.value ?? "OPEN";
  const threads = await getSupportThreads(activeFilter === "ALL" ? undefined : activeFilter);
  const activeLabel = FILTERS.find((f) => f.value === activeFilter)!.label;

  return (
    <div>
      <p className="text-small font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50)/0.8)]">Admin</p>
      <h1 className="font-hero text-hero font-bold text-balance mt-1.5 text-slate-50">Support Chat</h1>
      <p className="mt-2 text-small text-slate-500">
        {threads.length} conversation{threads.length === 1 ? "" : "s"} · {activeLabel.toLowerCase()} — when a visitor
        asks Atom to connect them with a person, the full chat lands here. Your replies show up to them as
        &quot;Support&quot;, never your name.
      </p>

      <div className="mt-6 flex w-fit flex-wrap gap-1.5 rounded-full p-1 bg-neu-base shadow-pressed-low">
        {FILTERS.map((filter) => (
          <Link
            key={filter.value}
            href={filter.value === "OPEN" ? "/admin/support" : `/admin/support?status=${filter.value}`}
            className={`tap inline-flex items-center rounded-full px-3 py-1.5 text-small font-medium transition ${
              activeFilter === filter.value ? "bg-[rgb(var(--signal)/0.14)] text-signal" : "text-slate-400 hover:text-slate-100"
            }`}
          >
            {filter.label}
          </Link>
        ))}
      </div>

      <div className="mt-6">
        <SupportChatPanel
          initialThreads={threads}
          statusFilter={activeFilter === "ALL" ? undefined : activeFilter}
          emptyMessage={activeFilter === "OPEN" ? "No open conversations — Atom's handling things on its own." : `No ${activeLabel.toLowerCase()} conversations.`}
        />
      </div>
    </div>
  );
}
