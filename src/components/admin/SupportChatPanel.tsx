"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { AssistantEscalationStatus, SupportMessageSender, SupportThreadSource } from "@prisma/client";
import {
  getSupportThreadsAction,
  getSupportThreadAction,
  sendSupportReplyAction,
  setSupportTypingAction,
  resolveSupportThreadAction,
  deleteSupportThreadAction,
  type AdminThreadSummary,
  type AdminThreadMessage,
} from "@/app/(dashboard)/admin/support/actions";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { RegionError } from "@/components/ui/RegionError";
import { usePoll } from "@/hooks/usePoll";
import { TypingIndicator } from "@/components/messaging/TypingIndicator";

const THREAD_LIST_POLL_MS = 15_000;
const ACTIVE_THREAD_POLL_MS = 2_500;

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

function MessageRow({ message, isEmail }: { message: AdminThreadMessage; isEmail: boolean }) {
  const isVisitor = message.sender === "VISITOR";
  return (
    <div className={`flex flex-col ${isVisitor ? "items-end" : "items-start"}`}>
      <span className="mb-1 px-1 text-small uppercase tracking-wide text-slate-600">
        {isVisitor && isEmail ? "Customer" : SENDER_LABEL[message.sender]}
        {message.sender === "SUPPORT" && message.sentByName && ` · ${message.sentByName}`}
      </span>
      <div
        className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-body ${
          isVisitor
            ? "bg-[rgb(var(--c-s-50))] text-slate-950"
            : message.sender === "SUPPORT"
              ? "border border-[rgb(var(--c-s-50)/0.3)] bg-[rgb(var(--c-s-50)/0.08)] text-slate-100"
              : "text-slate-300 bg-neu-base shadow-raised-low"
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
        <span className="flex items-center gap-1.5 truncate text-small font-medium text-slate-100">
          {thread.hasUnread && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[rgb(var(--c-s-50))]" />}
          {thread.contactName || thread.contactEmail}
        </span>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-small font-medium uppercase tracking-wide ${STATUS_STYLE[thread.status]}`}>
          {thread.status === "OPEN" ? "Open" : "Resolved"}
        </span>
      </div>
      {thread.source === "EMAIL" && thread.subject && (
        <p className="truncate text-small text-slate-300">{thread.subject}</p>
      )}
      {thread.lastMessage && (
        <p className="truncate text-small text-slate-500">
          {thread.lastMessage.sender === "SUPPORT" ? "You: " : thread.lastMessage.sender === "ATOM" ? "Atom: " : ""}
          {thread.lastMessage.body}
        </p>
      )}
      <span className="text-small text-slate-600">{relativeTime(thread.createdAt)}</span>
    </button>
  );
}

export interface SupportChatPanelProps {
  initialThreads: AdminThreadSummary[];
  statusFilter?: AssistantEscalationStatus;
  source?: SupportThreadSource;
  emptyMessage?: string;
}

function SupportChatPanelInner({ initialThreads, statusFilter, source = "CHAT", emptyMessage = "No conversations yet." }: SupportChatPanelProps) {
  const isEmail = source === "EMAIL";
  const searchParams = useSearchParams();
  // Read once, as the initial value only: deliberately not the live
  // searchParams value. Deep links (`?thread=…`) and the browser back/
  // forward buttons still work off this initial read; every switch after
  // that is local state updated via history.replaceState in selectThread,
  // not router.replace. router.replace re-enters the App Router and
  // re-fetches this whole route from the server just to change which
  // thread is highlighted, a second, pointless round trip stacked in
  // front of the real one (the message fetch below) on every single click,
  // which is a big part of why opening a thread felt slow.
  const [activeId, setActiveId] = useState<string | null>(() => searchParams.get("thread"));

  const [threads, setThreads] = useState(initialThreads);
  const [messages, setMessages] = useState<AdminThreadMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [threadStatus, setThreadStatus] = useState<AssistantEscalationStatus | null>(null);
  const [reply, setReply] = useState("");
  const [visitorTyping, setVisitorTyping] = useState(false);
  const [replyFocused, setReplyFocused] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeThread = threads.find((t) => t.id === activeId) ?? null;

  // The Open/Resolved/All tabs on the page above are plain <Link>s to
  // ?status=…, which re-renders this route on the server with a fresh
  // `initialThreads` for the new filter. But useState(initialThreads)
  // only reads that value on first mount, so without this the old tab's
  // list (a resolved thread included, if that's where you came from) sat
  // on screen until the poll below happened to fire. That poll used to
  // wait a full THREAD_LIST_POLL_MS before its very first fetch, too, so
  // "switch tabs quickly" reliably showed the wrong list for real,
  // noticeable seconds, not just a rare race.
  useEffect(() => {
    setThreads(initialThreads);
  }, [initialThreads]);

  const listPoll = usePoll(
    async (signal) => {
      const result = await getSupportThreadsAction(statusFilter, source);
      if (signal.aborted) return;
      setThreads(result);
    },
    THREAD_LIST_POLL_MS,
    { immediate: true, resetKey: `${source}:${statusFilter ?? "all"}` },
  );

  useEffect(() => {
    setConfirmingDelete(false);
    setSendError(null);
  }, [activeId]);

  // Switching threads used to leave the previously-selected thread's
  // messages on screen until the new ones arrived: reads as "the message
  // history takes a while to load" when really it's just showing the
  // wrong thread's history for a beat. Clear it immediately and show a
  // loading state instead; the poll after that reuses the same tick, but
  // only the first success for a given thread clears the loading flag, so a
  // refresh doesn't flicker a spinner.
  useEffect(() => {
    setMessages([]);
    setThreadStatus(null);
    setVisitorTyping(false);
    setMessagesLoading(Boolean(activeId));
  }, [activeId]);

  const threadPoll = usePoll(
    async (signal) => {
      if (!activeId) return;
      const result = await getSupportThreadAction(activeId);
      if (signal.aborted) return;
      if (result) {
        setMessages(result.messages);
        setThreadStatus(result.status);
        setVisitorTyping(result.visitorTyping);
      }
      setMessagesLoading(false);
    },
    ACTIVE_THREAD_POLL_MS,
    { enabled: Boolean(activeId), resetKey: activeId },
  );

  // The customer sees "Support is typing" for as long as the reply box is focused:
  // refreshed every 2 seconds, and stopped at once when it loses focus or the thread changes.
  useEffect(() => {
    if (isEmail || !activeId || !replyFocused) return;
    void setSupportTypingAction(activeId, true);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void setSupportTypingAction(activeId, true);
    }, 2_000);
    return () => {
      window.clearInterval(timer);
      void setSupportTypingAction(activeId, false);
    };
  }, [activeId, replyFocused, isEmail]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function selectThread(id: string | null) {
    setActiveId(id);
    const query = [isEmail ? "source=email" : null, statusFilter ? `status=${statusFilter}` : null, id ? `thread=${id}` : null].filter(Boolean).join("&");
    // Keeps the URL shareable/refreshable without going through the
    // App Router; see the note above on why this isn't router.replace.
    window.history.replaceState(null, "", `/admin/support${query ? `?${query}` : ""}`);
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!activeId || !reply.trim() || sending) return;
    setSending(true);
    setSendError(null);
    const result = await sendSupportReplyAction(activeId, reply.trim());
    if (!result.ok) setSendError(result.error);
    if (result.ok) {
      setReply("");
      const updated = await getSupportThreadAction(activeId);
      if (updated) {
        setMessages(updated.messages);
        setThreadStatus(updated.status);
      }
      setThreads(await getSupportThreadsAction(statusFilter, source));
    }
    setSending(false);
  }

  async function handleResolve() {
    if (!activeId || resolving) return;
    setResolving(true);
    await resolveSupportThreadAction(activeId);
    setThreadStatus("RESOLVED");
    setThreads(await getSupportThreadsAction(statusFilter, source));
    setResolving(false);
  }

  async function handleDelete() {
    if (!activeId || deleting) return;
    setDeleting(true);
    await deleteSupportThreadAction(activeId);
    setThreads((prev) => prev.filter((t) => t.id !== activeId));
    setDeleting(false);
    setConfirmingDelete(false);
    selectThread(null);
  }

  if (threads.length === 0) {
    return (
      <div className="space-y-3">
        {listPoll.failed && (
          <RegionError
            title="Can't check for new conversations."
            detail="Check your connection. We'll keep trying, or you can try now."
            onRetry={listPoll.retry}
          />
        )}
        <div className="glass-surface p-8 text-center text-small text-slate-500">{emptyMessage}</div>
      </div>
    );
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
          <div className="flex flex-1 items-center justify-center p-8 text-center text-small text-slate-500">
            Select a conversation to view its full history and reply.
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3 border-b border-ink/10 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-small font-semibold text-slate-50">
                  {isEmail && activeThread.subject ? activeThread.subject : activeThread.contactName || activeThread.contactEmail}
                </p>
                <p className="truncate text-small text-slate-500">
                  {isEmail && activeThread.contactName ? `${activeThread.contactName} · ` : ""}
                  {activeThread.contactEmail}
                  {activeThread.user && <> · has an account{activeThread.user.username ? ` (@${activeThread.user.username})` : ""}</>}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {threadStatus === "OPEN" && (
                  <button
                    type="button"
                    onClick={handleResolve}
                    disabled={resolving}
                    className="tap flex items-center justify-center rounded-lg px-3 py-1.5 text-small font-medium text-slate-300 transition disabled:opacity-50 bg-neu-base shadow-raised-low hover:shadow-raised-mid active:shadow-pressed-low"
                  >
                    {resolving && <MorphingSquare size={12} className="mr-1.5 shrink-0" />}
                    {resolving ? "Resolving…" : "Mark resolved"}
                  </button>
                )}
                {threadStatus === "RESOLVED" && (
                  <span className="rounded-full bg-slate-50/15 px-2.5 py-1 text-small font-medium text-slate-100">Resolved</span>
                )}
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  className="tap rounded-lg border border-red-500/30 px-3 py-1.5 text-small font-medium text-red-400 transition hover:bg-red-500/10"
                >
                  Delete
                </button>
              </div>
            </div>

            {confirmingDelete && (
              <div className="space-y-2 border-b border-ink/10 bg-red-500/5 px-4 py-3">
                <p className="text-small text-slate-400">
                  Permanently deletes this {isEmail ? "email thread" : "conversation"} and everything the{" "}
                  {isEmail ? "customer" : "visitor"} shared through it: their name, email, and every message. This
                  can&apos;t be undone.{isEmail ? " Your own copy in Gmail is not touched." : ""}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(false)}
                    disabled={deleting}
                    className="tap flex-1 rounded-lg py-2 text-small font-medium text-slate-300 transition disabled:opacity-50 bg-neu-base shadow-raised-low hover:shadow-raised-mid active:shadow-pressed-low"
                  >
                    Never mind
                  </button>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={deleting}
                    className="tap flex flex-1 items-center justify-center rounded-lg bg-red-500/95 py-2 text-small font-semibold text-slate-950 transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {deleting && <MorphingSquare size={12} className="mr-1.5 shrink-0" />}
                    {deleting ? "Deleting…" : "Delete permanently"}
                  </button>
                </div>
              </div>
            )}

            {/* overscroll-contain: same fix as the student-facing
                ChatWindow's own message list. This sits below a static
                thread header, so an uncontained bounce here can visibly
                slide over it for an instant on the way back up from the
                bottom. */}
            <div className="min-w-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4">
              {messagesLoading && threadPoll.failed ? (
                <div className="flex h-full items-center justify-center">
                  <RegionError
                    title="Couldn't load this conversation."
                    detail="Check your connection and try again."
                    onRetry={threadPoll.retry}
                  />
                </div>
              ) : messagesLoading ? (
                <div className="flex h-full items-center justify-center gap-2 text-small text-slate-500">
                  <MorphingSquare size={14} />
                  Loading messages…
                </div>
              ) : (
                <>
                  {messages.map((m) => (
                    <MessageRow key={m.id} message={m} isEmail={isEmail} />
                  ))}
                  {!isEmail && visitorTyping && threadStatus === "OPEN" && (
                    <div className="flex items-center gap-2 text-small text-slate-500" aria-live="polite">
                      Customer is typing <TypingIndicator />
                    </div>
                  )}
                  {(threadPoll.failed || listPoll.failed) && (
                    <RegionError
                      title="Live updates paused."
                      detail="Check your connection. We'll keep trying."
                      onRetry={() => {
                        threadPoll.retry();
                        listPoll.retry();
                      }}
                    />
                  )}
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>

            {sendError && (
              <p role="alert" className="border-t border-ink/10 bg-red-500/5 px-4 py-2 text-small text-red-400">
                {sendError}
              </p>
            )}
            <form onSubmit={handleSend} className="flex min-w-0 items-end gap-2 border-t border-ink/10 p-3">
              {isEmail ? (
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder="Write a reply. It is emailed to the customer from music@bassnotepiano.com."
                  maxLength={5000}
                  rows={3}
                  disabled={sending}
                  className="min-w-0 flex-1 resize-y rounded-xl px-3 py-2 text-body text-slate-100 outline-none transition placeholder:text-slate-500 focus-visible:ring-2 focus-visible:ring-ring bg-neu-base shadow-pressed-low"
                />
              ) : (
                <input
                  type="text"
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onFocus={() => setReplyFocused(true)}
                  onBlur={() => setReplyFocused(false)}
                  placeholder="Reply as Support…"
                  maxLength={2000}
                  disabled={sending}
                  className="min-w-0 flex-1 rounded-xl px-3 py-2 text-body text-slate-100 outline-none transition placeholder:text-slate-500 focus-visible:ring-2 focus-visible:ring-ring bg-neu-base shadow-pressed-low"
                />
              )}
              <button
                type="submit"
                disabled={sending || !reply.trim()}
                className="tap cta-sheen cta-fill flex shrink-0 items-center justify-center rounded-xl px-4 py-2 text-small font-semibold disabled:cursor-not-allowed disabled:opacity-60"
              >
                {sending && <MorphingSquare size={12} className="mr-1.5 shrink-0" />}
                {sending ? "Sending…" : isEmail ? "Send email" : "Send"}
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
