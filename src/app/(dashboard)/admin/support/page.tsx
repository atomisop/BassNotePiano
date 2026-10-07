import Link from "next/link";
import type { AssistantEscalationStatus, SupportThreadSource } from "@prisma/client";
import { getSupportThreads } from "@/lib/support";
import { SupportChatPanel } from "@/components/admin/SupportChatPanel";

const FILTERS: { label: string; value: AssistantEscalationStatus | "ALL" }[] = [
  { label: "Open", value: "OPEN" },
  { label: "Resolved", value: "RESOLVED" },
  { label: "All", value: "ALL" },
];

const SOURCES: { label: string; value: SupportThreadSource; param: string }[] = [
  { label: "Chat", value: "CHAT", param: "chat" },
  { label: "Email", value: "EMAIL", param: "email" },
];

export default async function AdminSupportPage({ searchParams }: { searchParams: { status?: string; source?: string } }) {
  const requested = searchParams.status?.toUpperCase();
  const activeFilter = FILTERS.find((f) => f.value === requested)?.value ?? "OPEN";
  const activeSource = SOURCES.find((s) => s.param === searchParams.source?.toLowerCase())?.value ?? "CHAT";
  const threads = await getSupportThreads(activeFilter === "ALL" ? undefined : activeFilter, undefined, activeSource);
  const activeLabel = FILTERS.find((f) => f.value === activeFilter)!.label;
  const hrefFor = (status: AssistantEscalationStatus | "ALL", source: SupportThreadSource) => {
    const query = [source === "EMAIL" ? "source=email" : null, status === "OPEN" ? null : `status=${status}`].filter(Boolean).join("&");
    return `/admin/support${query ? `?${query}` : ""}`;
  };

  return (
    <div>
      <p className="text-small font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50)/0.8)]">Admin</p>
      <h1 className="font-hero text-hero font-bold text-balance mt-1.5 text-slate-50">Support Chat</h1>
      <p className="mt-2 text-small text-slate-500">
        {threads.length} {activeSource === "EMAIL" ? "email thread" : "conversation"}{threads.length === 1 ? "" : "s"} · {activeLabel.toLowerCase()}
      </p>

      <div className="mt-6 flex w-fit gap-1.5 rounded-full p-1 bg-neu-base shadow-pressed-low">
        {SOURCES.map((source) => (
          <Link
            key={source.value}
            href={hrefFor(activeFilter, source.value)}
            className={`tap inline-flex items-center rounded-full px-4 py-1.5 text-small font-semibold transition ${
              activeSource === source.value ? "bg-[rgb(var(--signal)/0.14)] text-signal" : "text-slate-400 hover:text-slate-100"
            }`}
          >
            {source.label}
          </Link>
        ))}
      </div>

      <div className="mt-3 flex w-fit flex-wrap gap-1.5 rounded-full p-1 bg-neu-base shadow-pressed-low">
        {FILTERS.map((filter) => (
          <Link
            key={filter.value}
            href={hrefFor(filter.value, activeSource)}
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
          source={activeSource}
          emptyMessage={
            activeSource === "EMAIL"
              ? activeFilter === "OPEN" ? "No open emails." : `No ${activeLabel.toLowerCase()} emails.`
              : activeFilter === "OPEN" ? "No open conversations." : `No ${activeLabel.toLowerCase()} conversations.`
          }
        />
      </div>
    </div>
  );
}
