import Link from "next/link";
import { redirect } from "next/navigation";
import type { SupportThreadSource } from "@prisma/client";
import { getServerAuthSession } from "@/lib/auth";
import { getSupportThreads } from "@/lib/support";
import { SupportThreadList, type SupportListFilter } from "@/components/admin/SupportThreadList";
import { TAB_TRACK, tabItem } from "@/components/ui/tabStyles";

const FILTERS: { label: string; value: SupportListFilter; param: string }[] = [
  { label: "Open", value: "OPEN", param: "open" },
  { label: "Resolved", value: "RESOLVED", param: "resolved" },
  { label: "All", value: "ALL", param: "all" },
  { label: "Assigned to me", value: "MINE", param: "mine" },
];

const SOURCES: { label: string; value: SupportThreadSource; param: string }[] = [
  { label: "Chat", value: "CHAT", param: "chat" },
  { label: "Email", value: "EMAIL", param: "email" },
];

export const metadata = { title: "Admin: Support chat" };

export default async function AdminSupportPage({
  searchParams,
}: {
  searchParams: { filter?: string; status?: string; source?: string; thread?: string };
}) {
  // Old links opened a conversation beside the list; every conversation has its own page now.
  if (searchParams.thread) redirect(`/admin/support/${encodeURIComponent(searchParams.thread)}`);

  const session = await getServerAuthSession();
  if (session?.user?.role !== "ADMIN") redirect("/dashboard");
  const currentAdminId = session.user.id;

  // ?status= is what older links used.
  const requested = (searchParams.filter ?? searchParams.status)?.toLowerCase();
  const activeFilter = FILTERS.find((f) => f.param === requested)?.value ?? "OPEN";
  const activeSource = SOURCES.find((s) => s.param === searchParams.source?.toLowerCase())?.value ?? "CHAT";
  const mine = activeFilter === "MINE";

  const threads = mine
    ? await getSupportThreads(undefined, undefined, undefined, currentAdminId)
    : await getSupportThreads(activeFilter === "ALL" ? undefined : activeFilter, undefined, activeSource);
  const activeLabel = FILTERS.find((f) => f.value === activeFilter)!.label;

  const hrefFor = (filter: SupportListFilter, source: SupportThreadSource) => {
    const query = [
      source === "EMAIL" && filter !== "MINE" ? "source=email" : null,
      filter === "OPEN" ? null : `filter=${FILTERS.find((f) => f.value === filter)!.param}`,
    ]
      .filter(Boolean)
      .join("&");
    return `/admin/support${query ? `?${query}` : ""}`;
  };
  const noun = mine ? "case" : activeSource === "EMAIL" ? "email thread" : "conversation";

  return (
    <div>
      <p className="text-small font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50)/0.8)]">Admin</p>
      <h1 className="font-hero text-hero font-bold text-balance mt-1.5 text-slate-50">Support Chat</h1>
      <p className="mt-2 text-small text-slate-500">
        {threads.length} {noun}
        {threads.length === 1 ? "" : "s"} · {activeLabel.toLowerCase()}
      </p>

      <div className={`mt-6 ${TAB_TRACK}`}>
        {SOURCES.map((source) => (
          <Link
            key={source.value}
            href={hrefFor(mine ? "OPEN" : activeFilter, source.value)}
            className={tabItem(!mine && activeSource === source.value)}
          >
            {source.label}
          </Link>
        ))}
      </div>

      <div className={`mt-3 ${TAB_TRACK}`}>
        {FILTERS.map((filter) => (
          <Link
            key={filter.value}
            href={hrefFor(filter.value, activeSource)}
            className={tabItem(activeFilter === filter.value)}
          >
            {filter.label}
          </Link>
        ))}
      </div>

      <div className="mt-6">
        <SupportThreadList
          initialThreads={threads}
          source={activeSource}
          filter={activeFilter}
          currentAdminId={currentAdminId}
          emptyMessage={
            mine
              ? "No cases have been transferred to you."
              : activeSource === "EMAIL"
                ? activeFilter === "OPEN" ? "No open emails." : `No ${activeLabel.toLowerCase()} emails.`
                : activeFilter === "OPEN" ? "No open conversations." : `No ${activeLabel.toLowerCase()} conversations.`
          }
        />
      </div>
    </div>
  );
}
