"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { AssistantEscalationStatus, SupportThreadSource } from "@prisma/client";
import { getSupportThreadsAction, type AdminThreadSummary } from "@/app/(dashboard)/admin/support/actions";
import { RegionError } from "@/components/ui/RegionError";
import { usePoll } from "@/hooks/usePoll";
import { ViewMore } from "@/components/ui/ViewMore";
import { AdminEmptyState as EmptyState } from "@/components/admin/AdminEmptyState";
import { LifeBuoy } from "@/components/ui/appIcons";
import { StatusDot } from "@/components/ui/StatusDot";
import { Meta } from "@/components/ui/CardKit";

const LIST_POLL_MS = 15_000;

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
  const resolved = thread.status === "RESOLVED";
  // Unread threads stand out (a dot and a bold, bright name); resolved ones step back. Open is the normal state, so it gets no badge.
  const unread = thread.hasUnread && !resolved;
  return (
    <Link href={href} className="tap flex w-full flex-col gap-0.5 px-4 py-3 text-left transition hover:bg-slate-50/5">
      <div className="flex items-baseline justify-between gap-3">
        <span className={`flex min-w-0 items-center gap-2 truncate text-body ${unread || thread.hasUnread ? "font-semibold text-slate-50" : resolved ? "font-medium text-slate-400" : "font-medium text-slate-100"}`}>
          {thread.hasUnread && (
            <span className="h-2 w-2 shrink-0 rounded-full bg-slate-50">
              <span className="sr-only">Unread</span>
            </span>
          )}
          <span className="truncate">{thread.user?.name || thread.contactName || thread.contactEmail}</span>
        </span>
        <span suppressHydrationWarning className="shrink-0 text-caption tabular-nums text-slate-500">{relativeTime(thread.createdAt)}</span>
      </div>
      {thread.subject && <p className={`truncate text-small ${thread.hasUnread ? "text-slate-200" : "text-slate-400"}`}>{thread.subject}</p>}
      {thread.lastMessage && (
        <p className="truncate text-small text-slate-500">
          {thread.lastMessage.sender === "SUPPORT" ? "You: " : thread.lastMessage.sender === "ATOM" ? "Atom: " : ""}
          {thread.lastMessage.body}
        </p>
      )}
      {(isEmail || resolved || thread.assignedTo) && (
        <Meta
          className="mt-0.5 text-caption"
          items={[
            isEmail ? <StatusDot className="text-caption text-slate-400">Email</StatusDot> : null,
            resolved ? "Resolved" : null,
            thread.assignedTo ? (
              <span className={assignedToMe ? "font-medium text-slate-200" : undefined}>
                {assignedToMe ? "Assigned to you" : `Assigned to ${thread.assignedTo.name ?? "an admin"}`}
              </span>
            ) : null,
          ]}
        />
      )}
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
        <EmptyState icon={<LifeBuoy />} title={emptyMessage.replace(/\.$/, "")} description="New chats and emails from students land here." />
      ) : (
        <div data-stagger="" className="glass-surface divide-y divide-slate-50/8 overflow-hidden">
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
