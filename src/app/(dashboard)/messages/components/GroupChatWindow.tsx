"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import type { GroupSummary } from "@/lib/groupMessages";
import { Avatar } from "@/components/messaging/Avatar";
import { MessageBubble } from "@/components/messaging/MessageBubble";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { XIcon } from "@/components/ui/icons";
import { GroupAvatar } from "./GroupAvatar";
import type { GroupMessageRow } from "../actions";

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function groupTitle(group: GroupSummary): string {
  if (group.name) return group.name;
  if (group.memberNames.length === 0) return "Group";
  return group.memberNames.join(", ");
}

/** "You" for the current user's own messages, their name/handle otherwise, same label convention as MessageBubble's own BubbleReply.senderLabel. */
function labelFor(senderId: string, currentUserId: string, name: string | null, username: string | null): string {
  if (senderId === currentUserId) return "You";
  return name ?? (username ? `@${username}` : "Someone");
}

// A compose box taller than this scrolls internally instead of growing
// further; see the identical constant in ChatWindow.tsx (the 1:1
// equivalent of this compose box).
const MAX_COMPOSE_HEIGHT_PX = 140;

export function GroupChatWindow({
  group,
  currentUserId,
  messages,
  onSend,
  onMinimize,
  onLeave,
  onReact,
}: {
  group: GroupSummary;
  currentUserId: string;
  messages: GroupMessageRow[];
  onSend: (body: string, replyToId?: string) => Promise<boolean>;
  onMinimize: () => void;
  onLeave: () => Promise<void>;
  onReact: (messageId: string, emoji: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [replyingTo, setReplyingTo] = useState<GroupMessageRow | null>(null);
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Same reasoning as ChatWindow's own identical effect: a reply-in-progress
  // pointing at a message that's aged out of the loaded window can't show a
  // preview for it, so drop it instead of sending a dangling replyToId.
  useEffect(() => {
    if (replyingTo && !messages.some((m) => m.id === replyingTo.id)) setReplyingTo(null);
  }, [messages, replyingTo]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_COMPOSE_HEIGHT_PX)}px`;
  }, [draft]);

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

  async function handleLeave() {
    setLeaving(true);
    await onLeave();
    setLeaving(false);
  }

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <div className="flex items-center gap-2.5 border-b border-ink/10 p-4">
        <GroupAvatar />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-slate-100">{groupTitle(group)}</p>
          <p className="truncate text-xs text-slate-500">
            {group.memberCount} member{group.memberCount === 1 ? "" : "s"}
          </p>
        </div>
        {confirmingLeave ? (
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => setConfirmingLeave(false)}
              disabled={leaving}
              className="rounded-lg border border-ink/10 px-2.5 py-1.5 text-xs text-slate-300 transition hover:bg-slate-800 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleLeave}
              disabled={leaving}
              className="flex items-center justify-center rounded-lg bg-red-500/95 px-2.5 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-red-500 disabled:opacity-50"
            >
              {leaving && <MorphingSquare size={12} className="mr-1.5 shrink-0" />}
              {leaving ? "Leaving…" : "Leave group"}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingLeave(true)}
            className="shrink-0 rounded-lg border border-ink/10 px-2.5 py-1.5 text-xs text-slate-400 transition hover:border-red-400/30 hover:text-red-300"
          >
            Leave
          </button>
        )}
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
          visibly slide over that header for an instant, same fix as
          ChatWindow's own message list. */}
      <div className="min-w-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4">
        {messages.map((m) => {
          const isMine = m.senderId === currentUserId;
          return (
            <div key={m.id} className={`flex items-end gap-2 ${isMine ? "justify-end" : "justify-start"}`}>
              {!isMine && <Avatar image={m.senderImage} label={m.senderName ?? m.senderUsername ?? "?"} className="h-6 w-6 shrink-0 text-[10px]" />}
              <MessageBubble
                id={`msg-${m.id}`}
                isMine={isMine}
                body={m.body}
                timeLabel={relativeTime(m.createdAt)}
                senderLabel={!isMine ? labelFor(m.senderId, currentUserId, m.senderName, m.senderUsername) : undefined}
                reply={
                  m.replyTo
                    ? {
                        id: m.replyTo.id,
                        senderLabel: labelFor(m.replyTo.senderId, currentUserId, m.replyTo.senderName, m.replyTo.senderUsername),
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
        <div className="flex items-center gap-2 border-t border-ink/10 bg-slate-900/60 px-4 py-2">
          <div className="min-w-0 flex-1 border-l-2 border-[rgb(var(--c-s-50)/0.5)] pl-2">
            <p className="text-xs font-medium text-slate-300">
              Replying to {labelFor(replyingTo.senderId, currentUserId, replyingTo.senderName, replyingTo.senderUsername)}
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
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Write a message…"
          maxLength={2000}
          rows={1}
          enterKeyHint="send"
          // text-base, not text-sm — see the identical comment in
          // ChatWindow.tsx (the 1:1 equivalent of this input); this is the
          // group-chat message box hitting the same iOS auto-zoom bug.
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
