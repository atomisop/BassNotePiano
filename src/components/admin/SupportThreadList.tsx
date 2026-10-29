"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { AssistantEscalationStatus, SupportThreadSource } from "@prisma/client";
import { getSupportThreadsAction, type AdminThreadSummary } from "@/app/(dashboard)/admin/support/actions";
import { RegionError } from "@/components/ui/RegionError";
import { usePoll } from "@/hooks/usePoll";
import { ViewMore } from "@/components/ui/ViewMore";

const LIST_POLL_MS = 15_000;

const STATUS_STYLE: Record<string, string> = {
  OPEN: "bg-[rgb(var(--c-s-50)/0.15)] text-[rgb(var(--c-s-50))]",
  RESOLVED: "bg-slate-50/15 text-slate-100",
};

function relativeTime(iso: Date | string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export type SupportListFilter = AssistantEscalationStatus | "ALL" | "MINE";

export interface SupportThreadListProps {
  initialThreads: AdminThreadSummary[];
  source: SupportThreadSource;
  filter: SupportListFilter;
  currentAdminId: string;
  emptyMessage: string;
}

function ThreadRow({ thread, href, currentAdminId }: { thread: AdminThreadSummary; href: string; currentAdminId: string }) {
  const isEmail = thread.source === "EMAIL";
  const assignedToMe = thread.assignedTo?.id === currentAdminId;
  return (
    <Link href={href} className="tap flex w-full flex-col gap-1 px-4 py-3 text-left transition hover:bg-ink/5">
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 truncate text-small font-medium text-slate-100">
          {thread.hasUnread && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[rgb(var(--c-s-50))]" />}
          <span className="truncate">{thread.user?.name || thread.contactName || thread.contactEmail}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {isEmail && <span className="rounded-full bg-slate-50/10 px-2 py-0.5 text-small font-medium uppercase tracking-wide text-slate-300">Email</span>}
          <span className={`rounded-full px-2 py-0.5 text-small font-medium uppercase tracking-wide ${STATUS_STYLE[thread.status]}`}>
            {thread.status === "OPEN" ? "Open" : "Resolved"}
          </span>
        </span>
      </div>
      {thread.subject && <p className="truncate text-small text-slate-300">{thread.subject}</p>}
      {thread.lastMessage && (
        <p className="truncate text-small text-slate-500">
          {thread.lastMessage.sender === "SUPPORT" ? "You: " : thread.lastMessage.sender === "ATOM" ? "Atom: " : ""}
          {thread.lastMessage.body}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-small text-slate-500">
        <span>{relativeTime(thread.createdAt)}</span>
        {thread.assignedTo && (
          <span className={assignedToMe ? "font-medium text-[rgb(var(--c-s-50))]" : "text-slate-400"}>
            · {assignedToMe ? "Assigned to you" : `Assigned to ${thread.assignedTo.name ?? "an admin"}`}
          </span>
        )}
      </div>
    </Link>
  );
}

/** The list of conversations. Each one is a link to its own page, /admin/support/<id>. */
export function SupportThreadList({ initialThreads, source, filter, currentAdminId, emptyMessage }: SupportThreadListProps) {
  const [threads, setThreads] = useState(initialThreads);

  // The tabs above are plain links that re-render this route with a fresh list.
  useEffect(() => {
    setThreads(initialThreads);
  }, [initialThreads]);

  const poll = usePoll(
    async (signal) => {
      const result = await getSupportThreadsAction(filter === "ALL" || filter === "MINE" ? undefined : filter, source, filter === "MINE");
      if (signal.aborted) return;
      setThreads(result);
    },
    LIST_POLL_MS,
    { immediate: true, resetKey: `${source}:${filter}` },
  );

  const hrefFor = (thread: AdminThreadSummary) => {
    const query = [thread.source === "EMAIL" ? "source=email" : null, filter === "OPEN" ? null : `filter=${filter.toLowerCase()}`]
      .filter(Boolean)
      .join("&");
    return `/admin/support/${thread.id}${query ? `?${query}` : ""}`;
  };

  return (
    <div className="space-y-3">
      {poll.failed && (
        <RegionError
          title="Can't check for new conversations."
          detail="Check your connection. We'll keep trying, or you can try now."
          onRetry={poll.retry}
        />
      )}
      {threads.length === 0 ? (
        <div className="glass-surface p-8 text-center text-small text-slate-500">{emptyMessage}</div>
      ) : (
        <div className="glass-surface divide-y divide-ink/10 overflow-hidden">
          <ViewMore items={threads} initial={12} step={20}>
          {(thread) => (
            <ThreadRow key={thread.id} thread={thread} href={hrefFor(thread)} currentAdminId={currentAdminId} />
          )}
          </ViewMore>
        </div>
      )}
    </div>
  );
}
