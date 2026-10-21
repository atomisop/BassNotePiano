"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CANNED_REPLIES } from "@/lib/cannedReplies";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { SupportMessageSender } from "@prisma/client";
import {
  getSupportThreadAction,
  sendSupportReplyAction,
  setSupportTypingAction,
  resolveSupportThreadAction,
  deleteSupportThreadAction,
  type AdminThreadDetail,
  type AdminThreadMessage,
} from "@/app/(dashboard)/admin/support/actions";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { RegionError } from "@/components/ui/RegionError";
import { usePoll } from "@/hooks/usePoll";
import { TypingIndicator } from "@/components/messaging/TypingIndicator";
import { adminHandle, adminLabel, type MentionableAdmin } from "@/lib/supportCommands";
import { buttonVariants } from "@/components/ui/button";
import { BackLink } from "@/components/ui/BackLink";

const THREAD_POLL_MS = 2_500;

const SENDER_LABEL: Record<SupportMessageSender, string> = {
  VISITOR: "Visitor",
  ATOM: "Atom",
  SUPPORT: "Support",
  INTERNAL: "Internal note",
};

function MessageRow({ message, visitorLabel }: { message: AdminThreadMessage; visitorLabel: string }) {
  if (message.sender === "INTERNAL") {
    return (
      <div className="flex flex-col items-center">
        <span className="mb-1 px-1 text-small uppercase tracking-wide text-slate-600">
          Internal note{message.sentByName ? ` · ${message.sentByName}` : ""} · only admins see this
        </span>
        <div className="max-w-[90%] rounded-2xl border border-dashed border-slate-600 bg-slate-800/40 px-3.5 py-2 text-body text-slate-300">
          <p className="whitespace-pre-wrap break-words">{message.body}</p>
        </div>
      </div>
    );
  }
  const isVisitor = message.sender === "VISITOR";
  return (
    <div className={`flex flex-col ${isVisitor ? "items-end" : "items-start"}`}>
      <span className="mb-1 px-1 text-small uppercase tracking-wide text-slate-600">
        {isVisitor ? visitorLabel : SENDER_LABEL[message.sender]}
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

export interface SupportThreadViewProps {
  initial: AdminThreadDetail;
  admins: MentionableAdmin[];
  currentAdminId: string;
  /** The list this conversation was opened from, so Back returns to the same tab and filter. */
  backHref: string;
}

export function SupportThreadView({ initial, admins, currentAdminId, backHref }: SupportThreadViewProps) {
  const router = useRouter();
  const [detail, setDetail] = useState(initial);
  const [reply, setReply] = useState("");
  const [replyFocused, setReplyFocused] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const inputRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);

  const { thread } = detail;
  const isEmail = thread.source === "EMAIL";
  const open = detail.status === "OPEN";

  const poll = usePoll(
    async (signal) => {
      const result = await getSupportThreadAction(thread.id);
      if (signal.aborted) return;
      // Deleted by another admin while this page was open.
      if (!result) {
        router.replace(backHref);
        return;
      }
      setDetail(result);
    },
    THREAD_POLL_MS,
    { resetKey: thread.id },
  );

  // The customer sees "Support is typing" while the chat reply box is focused. Email has no live typing.
  useEffect(() => {
    if (isEmail || !replyFocused) return;
    void setSupportTypingAction(thread.id, true);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void setSupportTypingAction(thread.id, true);
    }, 2_000);
    return () => {
      window.clearInterval(timer);
      void setSupportTypingAction(thread.id, false);
    };
  }, [thread.id, replyFocused, isEmail]);

  // Typing "/" with no space yet offers the other admins. Nothing is sent until the form is submitted.
  const slashQuery = reply.startsWith("/") && !/\s/.test(reply) ? reply.slice(1).toLowerCase() : null;
  const options = useMemo(() => {
    if (slashQuery === null) return [];
    const all = [
      { id: "all", handle: "admin", label: "All admins", hint: "Notify every admin" },
      ...admins
        .filter((a) => a.id !== currentAdminId)
        .map((a) => ({ id: a.id, handle: adminHandle(a), label: adminLabel(a), hint: `/${adminHandle(a)}` })),
    ];
    return all.filter((o) => o.handle.includes(slashQuery) || o.label.toLowerCase().includes(slashQuery));
  }, [slashQuery, admins, currentAdminId]);

  async function handleSend(e?: React.FormEvent) {
    e?.preventDefault();
    if (!reply.trim() || sending) return;
    setSending(true);
    setError(null);
    setNotice(null);
    const result = await sendSupportReplyAction(thread.id, reply.trim());
    if (!result.ok) {
      setError(result.error);
    } else {
      setReply("");
      if (result.transferredTo) setNotice(`Transferred to ${result.transferredTo}. Nothing was sent to the customer.`);
      const updated = await getSupportThreadAction(thread.id);
      if (updated) setDetail(updated);
    }
    setSending(false);
  }

  async function handleResolve() {
    if (resolving) return;
    setResolving(true);
    await resolveSupportThreadAction(thread.id);
    const updated = await getSupportThreadAction(thread.id);
    if (updated) setDetail(updated);
    setResolving(false);
  }

  async function handleDelete() {
    if (deleting) return;
    setDeleting(true);
    await deleteSupportThreadAction(thread.id);
    router.replace(backHref);
  }

  // Who the customer is. A signed-in person always shows as themselves (their current account name),
  // never as an anonymous visitor.
  const personName = thread.user?.name || thread.contactName || (isEmail ? "Customer" : "Visitor");
  const title = isEmail && thread.subject ? thread.subject : thread.user?.name || thread.contactName || thread.contactEmail;

  return (
    <div className="flex flex-col gap-3">
      <BackLink href={backHref} className="tap inline-flex w-fit items-center gap-1.5 rounded-lg py-1 text-small font-medium text-slate-300 transition hover:text-slate-50">
        <span aria-hidden>←</span> Back
      </BackLink>

      {/* Tall enough to use the screen, short enough that the reply box ends above the floating dock. */}
      <div className="glass-surface flex h-[calc(100dvh-21rem)] min-h-[360px] min-w-0 flex-col overflow-hidden lg:h-[calc(100dvh-19rem)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/10 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-small font-semibold text-slate-50">{title}</p>
            <p className="truncate text-small text-slate-500">
              {!isEmail && thread.subject ? `${thread.subject} · ` : ""}
              {isEmail && thread.contactName ? `${thread.contactName} · ` : ""}
              {thread.contactEmail}
              {thread.user && <> · has an account{thread.user.username ? ` (@${thread.user.username})` : ""}</>}
            </p>
            {thread.assignedTo && (
              <p className="mt-0.5 truncate text-small font-medium text-[rgb(var(--c-s-50))]">
                {thread.assignedTo.id === currentAdminId ? "Assigned to you" : `Assigned to ${thread.assignedTo.name ?? "an admin"}`}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {open ? (
              <button
                type="button"
                onClick={handleResolve}
                disabled={resolving}
                className={buttonVariants({ variant: "secondary", size: "sm" })}
              >
                {resolving && <MorphingSquare size={12} className="mr-1.5 shrink-0" />}
                {resolving ? "Resolving…" : "Mark resolved"}
              </button>
            ) : (
              <span className="rounded-full bg-slate-50/15 px-2.5 py-1 text-small font-medium text-slate-100">Resolved</span>
            )}
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Delete
            </button>
          </div>
        </div>

        {confirmingDelete && (
          <div className="space-y-2 border-b border-ink/10 bg-red-500/5 px-4 py-3">
            <p className="text-small text-slate-400">
              Permanently deletes this {isEmail ? "email thread" : "conversation"} and everything the {isEmail ? "customer" : "visitor"} shared
              through it: their name, email, and every message, including internal notes. This can&apos;t be undone.
              {isEmail ? " Your own copy in Gmail is not touched." : ""}
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

        {/* No auto-scroll here: the list stays where you scrolled it while new messages arrive. */}
        <div className="min-w-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4">
          {detail.messages.map((m) => (
            <MessageRow key={m.id} message={m} visitorLabel={personName} />
          ))}
          {!isEmail && detail.visitorTyping && open && (
            <div className="flex items-center gap-2 text-small text-slate-500" aria-live="polite">
              {personName} is typing <TypingIndicator />
            </div>
          )}
          {poll.failed && (
            <RegionError title="Live updates paused." detail="Check your connection. We'll keep trying." onRetry={poll.retry} />
          )}
        </div>

        {error && (
          <p role="alert" className="border-t border-ink/10 bg-red-500/5 px-4 py-2 text-small text-red-400">
            {error}
          </p>
        )}
        {notice && !error && (
          <p role="status" className="border-t border-ink/10 bg-[rgb(var(--c-s-50)/0.08)] px-4 py-2 text-small text-slate-200">
            {notice}
          </p>
        )}

        {options.length > 0 && (
          <ul role="listbox" aria-label="Transfer this case to" className="max-h-48 divide-y divide-ink/10 overflow-y-auto border-t border-ink/10 bg-slate-900/60">
            {options.map((o) => (
              <li key={o.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  // mousedown, not click: the input must keep focus so the menu does not close first.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setReply(`/${o.handle} `);
                    inputRef.current?.focus();
                  }}
                  className="tap flex w-full items-center justify-between gap-3 px-4 py-2 text-left text-small transition hover:bg-ink/5"
                >
                  <span className="font-medium text-slate-100">{o.label}</span>
                  <span className="shrink-0 text-slate-400">{o.hint}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex gap-1.5 overflow-x-auto border-t border-ink/10 px-3 pt-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="Saved replies">
          {CANNED_REPLIES.map((c) => (
            <button
              key={c.label}
              type="button"
              disabled={sending}
              onClick={() => {
                setReply(c.text);
                inputRef.current?.focus();
              }}
              className="tap shrink-0 rounded-full bg-neu-base px-3 py-1 text-small text-slate-300 shadow-raised-low transition hover:text-slate-50 hover:shadow-raised-mid"
            >
              {c.label}
            </button>
          ))}
        </div>
        <form onSubmit={handleSend} className="flex min-w-0 items-end gap-2 p-3">
          {isEmail ? (
            <textarea
              ref={inputRef}
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder="Write a reply, emailed from music@bassnotepiano.com. Type / to transfer the case."
              maxLength={5000}
              rows={3}
              disabled={sending}
              className="min-w-0 flex-1 resize-y rounded-xl px-3 py-2 text-body text-slate-100 outline-none transition placeholder:text-slate-500 focus-visible:ring-2 focus-visible:ring-ring bg-neu-base shadow-pressed-low"
            />
          ) : (
            <input
              ref={inputRef}
              type="text"
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onFocus={() => setReplyFocused(true)}
              onBlur={() => setReplyFocused(false)}
              placeholder="Reply as Support. Type / to transfer the case."
              maxLength={2000}
              disabled={sending}
              className="min-w-0 flex-1 rounded-xl px-3 py-2 text-body text-slate-100 outline-none transition placeholder:text-slate-500 focus-visible:ring-2 focus-visible:ring-ring bg-neu-base shadow-pressed-low"
            />
          )}
          <button
            type="submit"
            disabled={sending || !reply.trim()}
            className={buttonVariants({ variant: "primary", size: "sm", className: "flex shrink-0" })}
          >
            {sending && <MorphingSquare size={12} className="mr-1.5 shrink-0" />}
            {sending ? "Sending…" : slashQuery !== null || reply.startsWith("/") ? "Transfer" : isEmail ? "Send email" : "Send"}
          </button>
        </form>
      </div>
    </div>
  );
}
