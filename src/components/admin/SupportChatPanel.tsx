"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { AssistantEscalationStatus, SupportMessageSender } from "@prisma/client";
import {
  getSupportThreadsAction,
  getSupportThreadAction,
  sendSupportReplyAction,
  resolveSupportThreadAction,
  type AdminThreadSummary,
  type AdminThreadMessage,
} from "@/app/(dashboard)/admin/support/actions";

const THREAD_LIST_POLL_MS = 15_000;
const ACTIVE_THREAD_POLL_MS = 2_500;

const STATUS_STYLE: Record<string, string> = {
  OPEN: "bg-[rgb(var(--c-a-400)/0.15)] text-[rgb(var(--c-a-300))]",
  RESOLVED: "bg-emerald-400/15 text-emerald-300",
};

function relativeTime(iso: Date | string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// The label a visitor would see for each sender — kept as the single source
// of truth for both panes so "Support" (never a name) is what shows up
// everywhere a sender needs naming, admin view included. sentByName (below)
// is layered on top of this only for the admin's own internal accountability.
const SENDER_LABEL: Record<SupportMessageSender, string> = {
  VISITOR: "Visitor",
  ATOM: "Atom",
  SUPPORT: "Support",
};

function MessageRow({ message }: { message: AdminThreadMessage }) {
  const isVisitor = message.sender === "VISITOR";
  return (
    <div className={`flex flex-col ${isVisitor ? "items-end" : "items-start"}`}>
      <span className="mb-1 px-1 text-[10px] uppercase tracking-wide text-slate-600">
        {SENDER_LABEL[message.sender]}
        {message.sender === "SUPPORT" && message.sentByName && ` · ${message.sentByName}`}
      </span>
      <div
        className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${
          isVisitor
            ? "bg-[rgb(var(--c-a-400))] text-slate-950"
            : message.sender === "SUPPORT"
              ? "border border-[rgb(var(--c-a-400)/0.3)] bg-[rgb(var(--c-a-400)/0.08)] text-slate-100"
              : "border border-ink/10 bg-slate-950 text-slate-300"
        }`}
      >
        <p className="whitespace-pre-wrap break-words">{message.body}</p>
      </div>
    </div>
  );
}

function ThreadListRow({
  thread,
  active,
  onSelect,
}: {
  thread: AdminThreadSummary;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full flex-col gap-1 px-4 py-3 text-left transition ${
        active ? "bg-slate-800" : "hover:bg-ink/5"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 truncate text-sm font-medium text-slate-100">
          {thread.hasUnread && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[rgb(var(--c-a-400))]" />}
          {thread.contactName || thread.contactEmail}
        </span>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${STATUS_STYLE[thread.status]}`}>
          {thread.status === "OPEN" ? "Open" : "Resolved"}
        </span>
      </div>
      {thread.lastMessage && (
        <p className="truncate text-xs text-slate-500">
          {thread.lastMessage.sender === "SUPPORT" ? "You: " : thread.lastMessage.sender === "ATOM" ? "Atom: " : ""}
          {thread.lastMessage.body}
        </p>
      )}
      <span className="text-[10px] text-slate-600">{relativeTime(thread.createdAt)}</span>
    </button>
  );
}

export interface SupportChatPanelProps {
  initialThreads: AdminThreadSummary[];
  statusFilter?: AssistantEscalationStatus;
  emptyMessage?: string;
}

function SupportChatPanelInner({ initialThreads, statusFilter, emptyMessage = "No conversations yet." }: SupportChatPanelProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeId = searchParams.get("thread");

  const [threads, setThreads] = useState(initialThreads);
  const [messages, setMessages] = useState<AdminThreadMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [threadStatus, setThreadStatus] = useState<AssistantEscalationStatus | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [resolving, setResolving] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeThread = threads.find((t) => t.id === activeId) ?? null;

  useEffect(() => {
    const interval = setInterval(async () => {
      setThreads(await getSupportThreadsAction(statusFilter));
    }, THREAD_LIST_POLL_MS);
    return () => clearInterval(interval);
  }, [statusFilter]);

  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      setThreadStatus(null);
      setMessagesLoading(false);
      return;
    }
    let cancelled = false;
    let initialLoad = true;

    // Switching threads used to leave the previously-selected thread's
    // messages on screen until the new ones arrived — reads as "the message
    // history takes a while to load" when really it's just showing the
    // wrong thread's history for a beat. Clear it immediately and show a
    // loading state instead; the 2.5s poll after that reuses this same
    // `load`, but only the very first call for a given thread flips the
    // loading flag — a poll refresh shouldn't flicker a spinner.
    setMessages([]);
    setMessagesLoading(true);

    async function load() {
      const result = await getSupportThreadAction(activeId!);
      if (cancelled || !result) return;
      setMessages(result.messages);
      setThreadStatus(result.status);
      if (initialLoad) {
        setMessagesLoading(false);
        initialLoad = false;
      }
    }
    load();

    const interval = setInterval(load, ACTIVE_THREAD_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [activeId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function selectThread(id: string) {
    router.replace(`/admin/support?${statusFilter ? `status=${statusFilter}&` : ""}thread=${id}`, { scroll: false });
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!activeId || !reply.trim() || sending) return;
    setSending(true);
    const result = await sendSupportReplyAction(activeId, reply.trim());
    if (result.ok) {
      setReply("");
      const updated = await getSupportThreadAction(activeId);
      if (updated) {
        setMessages(updated.messages);
        setThreadStatus(updated.status);
      }
      setThreads(await getSupportThreadsAction(statusFilter));
    }
    setSending(false);
  }

  async function handleResolve() {
    if (!activeId || resolving) return;
    setResolving(true);
    await resolveSupportThreadAction(activeId);
    setThreadStatus("RESOLVED");
    setThreads(await getSupportThreadsAction(statusFilter));
    setResolving(false);
  }

  if (threads.length === 0) {
    return <div className="glass-surface p-8 text-center text-sm text-slate-500">{emptyMessage}</div>;
  }

  return (
    // h-[70vh] used to measure against the full viewport, ignoring both this
    // page's own header above it and the floating AppDock below it — tall
    // enough that the reply input ended up rendered behind the dock on
    // common desktop viewport heights. calc() here reserves real space for
    // both instead of guessing at a smaller vh percentage.
    <div className="flex h-[calc(100vh-22rem)] min-h-[420px] flex-col gap-4 overflow-hidden lg:flex-row">
      <div className="glass-surface flex w-full shrink-0 flex-col overflow-y-auto lg:w-72">
        <div className="divide-y divide-ink/10">
          {threads.map((thread) => (
            <ThreadListRow key={thread.id} thread={thread} active={thread.id === activeId} onSelect={() => selectThread(thread.id)} />
          ))}
        </div>
      </div>

      <div className="glass-surface flex min-w-0 flex-1 flex-col overflow-hidden">
        {!activeThread ? (
          <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-slate-500">
            Select a conversation to view its full history and reply.
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3 border-b border-ink/10 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-50">{activeThread.contactName || activeThread.contactEmail}</p>
                <p className="truncate text-xs text-slate-500">
                  {activeThread.contactEmail}
                  {activeThread.user && <> · has an account{activeThread.user.username ? ` (@${activeThread.user.username})` : ""}</>}
                </p>
              </div>
              {threadStatus === "OPEN" && (
                <button
                  type="button"
                  onClick={handleResolve}
                  disabled={resolving}
                  className="shrink-0 rounded-lg border border-ink/10 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-slate-800 disabled:opacity-50"
                >
                  {resolving ? "Resolving…" : "Mark resolved"}
                </button>
              )}
              {threadStatus === "RESOLVED" && (
                <span className="shrink-0 rounded-full bg-emerald-400/15 px-2.5 py-1 text-[11px] font-medium text-emerald-300">Resolved</span>
              )}
            </div>

            <div className="min-w-0 flex-1 space-y-3 overflow-y-auto p-4">
              {messagesLoading ? (
                <div className="flex h-full items-center justify-center text-sm text-slate-500">Loading messages…</div>
              ) : (
                <>
                  {messages.map((m) => (
                    <MessageRow key={m.id} message={m} />
                  ))}
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>

            <form onSubmit={handleSend} className="flex min-w-0 gap-2 border-t border-ink/10 p-3">
              <input
                type="text"
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Reply as Support…"
                maxLength={2000}
                disabled={sending}
                className="min-w-0 flex-1 rounded-xl border border-ink/10 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-[rgb(var(--c-a-400)/0.4)]"
              />
              <button
                type="submit"
                disabled={sending || !reply.trim()}
                className="cta-sheen cta-fill shrink-0 rounded-xl px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
              >
                {sending ? "Sending…" : "Send"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

export function SupportChatPanel(props: SupportChatPanelProps) {
  return (
    <Suspense fallback={null}>
      <SupportChatPanelInner {...props} />
    </Suspense>
  );
}
