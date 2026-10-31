"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import type { ConversationSummary } from "@/lib/messages";
import { Avatar } from "./Avatar";
import { TypingIndicator } from "./TypingIndicator";
import { MessageBubble } from "./MessageBubble";
import { XIcon } from "@/components/ui/icons";
import { ComposerBar, DayDivider, THREAD_HEADER, ThreadBackButton, ThreadSkeleton, clockLabel, layoutThread } from "./threadUi";
import { scrollWithin } from "@/lib/scrollWithin";

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
  /** Set by the server the moment the recipient actually has the chat open and visible. */
  readAt: string | null;
  replyTo: MessageReplyPreview | null;
  reactions: MessageReactionRow[];
}

// Throttled, not debounced, pings the server at most once per window while
// the user keeps typing, instead of waiting for a pause. TypingStatus rows
// go stale on their own (see TYPING_STALE_MS in src/lib/messages.ts), so
// there's no matching "stopped typing" call to send.
const TYPING_PING_THROTTLE_MS = 1_500;
// While the composer stays focused, re-ping a little inside the server's 4s staleness window.
const TYPING_REFRESH_MS = 2_000;

// A compose box taller than this scrolls internally instead of growing
// further, about six lines at text-body, generous for a real message
// without ever pushing the thread itself off-screen.
const MAX_COMPOSE_HEIGHT_PX = 140;

export function ChatWindow({
  conversation,
  messages,
  loading = false,
  currentUserId,
  onSend,
  onMinimize,
  onTyping,
  onReact,
}: {
  conversation: ConversationSummary;
  messages: MessageRow[];
  /** True until this thread's first fetch has answered: shows placeholder bubbles, not an empty pane. */
  loading?: boolean;
  currentUserId: string;
  onSend: (body: string, replyToId?: string) => Promise<boolean>;
  onMinimize: () => void;
  /** Called (throttled below) as the user types, caller wires this to its own setTypingAction. */
  onTyping: (friendId: string, typing: boolean) => void;
  onReact: (messageId: string, emoji: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [replyingTo, setReplyingTo] = useState<MessageRow | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const lastTypingPingRef = useRef(0);
  const [composerFocused, setComposerFocused] = useState(false);
  const lastMineId = [...messages].reverse().find((m) => m.senderId !== conversation.friendId)?.id ?? null;

  useEffect(() => {
    scrollWithin(messagesEndRef.current, "end");
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

  // "Typing" starts when the keyboard opens (the box gets focus), not only on
  // a keystroke, and keeps refreshing server-side while it stays open: the
  // other person's screen reads it back from the database, and a row goes
  // stale on its own a few seconds after the last ping (TYPING_STALE_MS).
  useEffect(() => {
    if (!composerFocused) return;
    const ping = () => {
      if (document.visibilityState !== "visible") return;
      lastTypingPingRef.current = Date.now();
      onTyping(conversation.friendId, true);
    };
    ping();
    const timer = window.setInterval(ping, TYPING_REFRESH_MS);
    return () => {
      window.clearInterval(timer);
      // Keyboard closed, box unfocused or chat switched: stop showing it at once.
      onTyping(conversation.friendId, false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composerFocused, conversation.friendId]);

  function handleDraftChange(value: string) {
    setDraft(value);
    const now = Date.now();
    if (now - lastTypingPingRef.current > TYPING_PING_THROTTLE_MS) {
      lastTypingPingRef.current = now;
      onTyping(conversation.friendId, true);
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
    scrollWithin(document.getElementById(`msg-${messageId}`), "center");
  }

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <div className={THREAD_HEADER}>
        <ThreadBackButton onClick={onMinimize} />
        <Avatar userId={conversation.friendId} image={conversation.friendImage} label={conversation.friendName ?? conversation.friendUsername ?? "?"} className="h-10 w-10 text-body" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-body font-semibold text-slate-100">{conversation.friendName ?? "Unnamed"}</p>
          {conversation.isTyping ? (
            <p className="flex items-center gap-1.5 text-small text-slate-50">
              typing <TypingIndicator />
            </p>
          ) : (
            conversation.friendUsername && <p className="truncate text-small text-slate-500">@{conversation.friendUsername}</p>
          )}
        </div>
      </div>

      {/* overscroll-contain: this list sits right below a static header row
          (avatar/name/minimize above). Without it, scrolling to the
          bottom of a thread and flinging back up rubber-bands and can
          visibly slide over that header for an instant on iOS. Same fix
          (dashboard)/layout.tsx already applies to its own <main>. */}
      <div data-chat-scroll className="min-w-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 md:px-4">
        {loading && messages.length === 0 && <ThreadSkeleton />}
        {layoutThread(messages).map((meta, i) => {
          const m = messages[i];
          const isMine = m.senderId !== conversation.friendId;
          return (
            <div key={m.id} className={meta.startsCluster && i > 0 && !meta.showDay ? "mt-4" : "mt-0.5"}>
              {meta.showDay && <DayDivider iso={m.createdAt} />}
            <MessageBubble
              id={`msg-${m.id}`}
              isMine={isMine}
              body={m.body}
              timeLabel={clockLabel(m.createdAt)}
              statusLabel={m.id === lastMineId ? (m.readAt ? `Seen ${clockLabel(m.readAt)}` : "Sent") : undefined}
              showTime={meta.endsCluster}
              endsCluster={meta.endsCluster}
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
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {replyingTo && (
        <div className="flex items-center gap-2 bg-neu-base shadow-pressed-low px-4 py-2">
          <div className="min-w-0 flex-1 border-l-2 border-slate-50/50 pl-2">
            <p className="text-small font-medium text-slate-300">
              Replying to {replyingTo.senderId === conversation.friendId ? conversation.friendName ?? conversation.friendUsername ?? "Unnamed" : "yourself"}
            </p>
            <p className="truncate text-small text-slate-500">{replyingTo.body}</p>
          </div>
          <button
            type="button"
            onClick={() => setReplyingTo(null)}
            aria-label="Cancel reply"
            className="tap flex shrink-0 items-center justify-center text-slate-500 transition hover:text-slate-300"
          >
            <XIcon size={14} />
          </button>
        </div>
      )}

      <ComposerBar
        formRef={formRef}
        textareaRef={textareaRef}
        value={draft}
        onChange={handleDraftChange}
        onKeyDown={handleKeyDown}
        onSubmit={handleSubmit}
        sending={sending}
        maxHeight={MAX_COMPOSE_HEIGHT_PX}
        onFocusChange={setComposerFocused}
      />
    </div>
  );
}
