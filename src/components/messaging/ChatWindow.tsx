"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import type { ConversationSummary } from "@/lib/messages";
import { Avatar } from "./Avatar";
import { TypingIndicator } from "./TypingIndicator";
import { MessageBubble } from "./MessageBubble";
import { XIcon } from "@/components/ui/icons";

export interface MessageReplyPreview {
  id: string;
  senderId: string;
  body: string;
}

export interface MessageReactionRow {
  userId: string;
  emoji: string;
}

/** Matches /messages's own actions file's exported MessageRow type shape structurally. */
export interface MessageRow {
  id: string;
  senderId: string;
  body: string;
  createdAt: string;
  replyTo: MessageReplyPreview | null;
  reactions: MessageReactionRow[];
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

// Throttled, not debounced — pings the server at most once per window while
// the user keeps typing, instead of waiting for a pause. TypingStatus rows
// go stale on their own (see TYPING_STALE_MS in src/lib/messages.ts), so
// there's no matching "stopped typing" call to send.
const TYPING_PING_THROTTLE_MS = 1_500;

// A compose box taller than this scrolls internally instead of growing
// further, about six lines at text-base, generous for a real message
// without ever pushing the thread itself off-screen.
const MAX_COMPOSE_HEIGHT_PX = 140;

export function ChatWindow({
  conversation,
  messages,
  currentUserId,
  onSend,
  onMinimize,
  onTyping,
  onReact,
}: {
  conversation: ConversationSummary;
  messages: MessageRow[];
  currentUserId: string;
  onSend: (body: string, replyToId?: string) => Promise<boolean>;
  onMinimize: () => void;
  /** Called (throttled below) as the user types — caller wires this to its own setTypingAction. */
  onTyping: (friendId: string) => void;
  onReact: (messageId: string, emoji: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [replyingTo, setReplyingTo] = useState<MessageRow | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const lastTypingPingRef = useRef(0);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // A reply-in-progress that points at a message no longer in the loaded
  // window (switched threads and back, older history aged out) would send a
  // replyToId nothing here can show a preview for. Drop it instead.
  useEffect(() => {
    if (replyingTo && !messages.some((m) => m.id === replyingTo.id)) setReplyingTo(null);
  }, [messages, replyingTo]);

  // Auto-grow: recomputed whenever the draft's rendered value actually
  // changes, so it also fires (and shrinks the box back to one line) right
  // after a send clears the draft, not just while typing.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_COMPOSE_HEIGHT_PX)}px`;
  }, [draft]);

  function handleDraftChange(value: string) {
    setDraft(value);
    const now = Date.now();
    if (now - lastTypingPingRef.current > TYPING_PING_THROTTLE_MS) {
      lastTypingPingRef.current = now;
      onTyping(conversation.friendId);
    }
  }

  // Enter sends, Shift+Enter inserts a newline: iMessage's own convention,
  // and what "the box should show the message fully instead of hiding it"
  // needs a real multi-line compose box to support in the first place.
  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      formRef.current?.requestSubmit();
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    setSending(true);
    const body = draft;
    const pendingReply = replyingTo;
    setDraft("");
    setReplyingTo(null);
    const ok = await onSend(body, pendingReply?.id);
    setSending(false);
    if (!ok) {
      setDraft(body);
      setReplyingTo(pendingReply);
    }
  }

  function handleJumpToReply(messageId: string) {
    document.getElementById(`msg-${messageId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <div className="flex items-center gap-2.5 border-b border-ink/10 p-4">
        <Avatar image={conversation.friendImage} label={conversation.friendName ?? conversation.friendUsername ?? "?"} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-slate-100">{conversation.friendName ?? "Unnamed"}</p>
          {conversation.isTyping ? (
            <p className="flex items-center gap-1.5 text-xs text-[rgb(var(--c-s-50))]">
              typing <TypingIndicator />
            </p>
          ) : (
            conversation.friendUsername && <p className="truncate text-xs text-slate-500">@{conversation.friendUsername}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onMinimize}
          aria-label="Minimize chat"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-ink/10 text-slate-400 transition hover:border-ink/15 hover:bg-ink/5 hover:text-slate-200"
        >
          <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* overscroll-contain: this list sits right below a static header row
          (avatar/name/minimize above). Without it, scrolling to the
          bottom of a thread and flinging back up rubber-bands and can
          visibly slide over that header for an instant on iOS. Same fix
          (dashboard)/layout.tsx already applies to its own <main>. */}
      <div className="min-w-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4">
        {messages.map((m) => {
          const isMine = m.senderId !== conversation.friendId;
          return (
            <MessageBubble
              key={m.id}
              id={`msg-${m.id}`}
              isMine={isMine}
              body={m.body}
              timeLabel={relativeTime(m.createdAt)}
              reply={
                m.replyTo
                  ? {
                      id: m.replyTo.id,
                      senderLabel: m.replyTo.senderId === conversation.friendId ? conversation.friendName ?? conversation.friendUsername ?? "Unnamed" : "You",
                      body: m.replyTo.body,
                    }
                  : null
              }
              reactions={m.reactions}
              currentUserId={currentUserId}
              onReplyStart={() => setReplyingTo(m)}
              onReact={(emoji) => onReact(m.id, emoji)}
              onJumpToReply={handleJumpToReply}
            />
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {replyingTo && (
        <div className="flex items-center gap-2 border-t border-ink/10 bg-slate-900/60 px-4 py-2">
          <div className="min-w-0 flex-1 border-l-2 border-[rgb(var(--c-s-50)/0.5)] pl-2">
            <p className="text-xs font-medium text-slate-300">
              Replying to {replyingTo.senderId === conversation.friendId ? conversation.friendName ?? conversation.friendUsername ?? "Unnamed" : "yourself"}
            </p>
            <p className="truncate text-xs text-slate-500">{replyingTo.body}</p>
          </div>
          <button
            type="button"
            onClick={() => setReplyingTo(null)}
            aria-label="Cancel reply"
            className="shrink-0 text-slate-500 transition hover:text-slate-300"
          >
            <XIcon size={14} />
          </button>
        </div>
      )}

      <form ref={formRef} onSubmit={handleSubmit} className="flex min-w-0 items-end gap-2 border-t border-ink/10 p-3">
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => handleDraftChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Write a message…"
          maxLength={2000}
          rows={1}
          enterKeyHint="send"
          // text-base (16px), not text-sm: below 16px, iOS Safari auto-zooms
          // the whole page in on focus and doesn't reliably zoom back out
          // after — reported live as "the message box zooms in and I can't
          // even see who I'm writing to." Same fix applied to every real
          // text-entry control across the signed-in app, not just this one.
          className="min-w-0 flex-1 resize-none overflow-y-auto glass-surface-subtle px-3 py-2 text-base text-slate-100 outline-none transition focus:border-[rgb(var(--c-s-50)/0.6)]"
          style={{ maxHeight: MAX_COMPOSE_HEIGHT_PX }}
        />
        <button
          type="submit"
          disabled={sending || !draft.trim()}
          className="cta-sheen cta-fill shrink-0 rounded-lg px-4 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-60"
        >
          Send
        </button>
      </form>
    </div>
  );
}
