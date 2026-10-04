"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import type { GroupSummary } from "@/lib/groupMessages";
import { Avatar } from "@/components/messaging/Avatar";
import { MessageBubble } from "@/components/messaging/MessageBubble";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { XIcon } from "@/components/ui/icons";
import { TypingIndicator as GroupTypingIndicator } from "@/components/ui/typing-indicator";
import { ComposerBar, DayDivider, THREAD_HEADER, ThreadBackButton, clockLabel, layoutThread } from "@/components/messaging/threadUi";
import { GroupAvatar } from "./GroupAvatar";
import type { GroupMessageRow } from "../actions";
import { scrollWithin } from "@/lib/scrollWithin";

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

// Same cadence as ChatWindow: ping at most every 1.5s while typing, and re-ping
// every 2.5s while the box stays focused, inside the server's 4s window.
const TYPING_PING_THROTTLE_MS = 1_500;
const TYPING_REFRESH_MS = 2_500;

export function GroupChatWindow({
  group,
  currentUserId,
  messages,
  onSend,
  onMinimize,
  onLeave,
  onReact,
  typingNames,
  onTyping,
}: {
  group: GroupSummary;
  currentUserId: string;
  messages: GroupMessageRow[];
  onSend: (body: string, replyToId?: string) => Promise<boolean>;
  onMinimize: () => void;
  onLeave: () => Promise<void>;
  onReact: (messageId: string, emoji: string) => void;
  /** Other members typing right now, as reported by the server. */
  typingNames: string[];
  /** Tell the server this person is typing in this group (caller wires setGroupTypingAction). */
  onTyping: (groupId: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [replyingTo, setReplyingTo] = useState<GroupMessageRow | null>(null);
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const [composerFocused, setComposerFocused] = useState(false);
  const lastTypingPingRef = useRef(0);
  const lastMineId = [...messages].reverse().find((m) => m.senderId === currentUserId)?.id ?? null;
  const [leaving, setLeaving] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    scrollWithin(messagesEndRef.current, "end");
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
    scrollWithin(document.getElementById(`msg-${messageId}`), "center");
  }

  // Same rule as 1-on-1: typing starts when the keyboard opens and keeps
  // refreshing server-side while the box stays focused (rows go stale on
  // their own a few seconds after the last ping).
  useEffect(() => {
    if (!composerFocused) return;
    const ping = () => {
      if (document.visibilityState !== "visible") return;
      lastTypingPingRef.current = Date.now();
      onTyping(group.id);
    };
    ping();
    const timer = window.setInterval(ping, TYPING_REFRESH_MS);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composerFocused, group.id]);

  function handleDraftChange(value: string) {
    setDraft(value);
    if (Date.now() - lastTypingPingRef.current > TYPING_PING_THROTTLE_MS) {
      lastTypingPingRef.current = Date.now();
      onTyping(group.id);
    }
  }

  async function handleLeave() {
    setLeaving(true);
    await onLeave();
    setLeaving(false);
  }

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <div className={THREAD_HEADER}>
        <ThreadBackButton onClick={onMinimize} />
        <GroupAvatar className="h-10 w-10" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-body font-semibold text-slate-100">{groupTitle(group)}</p>
          <p className="truncate text-small text-slate-500">
            {group.memberCount} member{group.memberCount === 1 ? "" : "s"}
          </p>
        </div>
        {confirmingLeave ? (
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => setConfirmingLeave(false)}
              disabled={leaving}
              className="tap rounded-lg px-2.5 py-1.5 text-small text-slate-300 transition disabled:opacity-50 bg-neu-base shadow-raised-low hover:shadow-raised-mid active:shadow-pressed-low"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleLeave}
              disabled={leaving}
              className="tap flex items-center justify-center rounded-lg bg-red-500/95 px-2.5 py-1.5 text-small font-semibold text-slate-950 transition hover:bg-red-500 disabled:opacity-50"
            >
              {leaving && <MorphingSquare size={12} className="mr-1.5 shrink-0" />}
              {leaving ? "Leaving…" : "Leave group"}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingLeave(true)}
            className="tap shrink-0 rounded-lg px-2.5 py-1.5 text-small text-slate-400 transition hover:text-red-300 bg-neu-base shadow-raised-low hover:shadow-raised-mid active:shadow-pressed-low"
          >
            Leave
          </button>
        )}
      </div>

      {/* overscroll-contain: this list sits right below a static header row
          (avatar/name/minimize above). Without it, scrolling to the
          bottom of a thread and flinging back up rubber-bands and can
          visibly slide over that header for an instant, same fix as
          ChatWindow's own message list. */}
      <div className="min-w-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 md:px-4">
        {layoutThread(messages).map((meta, i) => {
          const m = messages[i];
          const isMine = m.senderId === currentUserId;
          return (
            <div key={m.id} className={meta.startsCluster && i > 0 && !meta.showDay ? "mt-3" : "mt-0.5"}>
              {meta.showDay && <DayDivider iso={m.createdAt} />}
              <div className={`flex items-end gap-2 ${isMine ? "justify-end" : "justify-start"}`}>
                {!isMine &&
                  (meta.endsCluster ? (
                    <Avatar image={m.senderImage} label={m.senderName ?? m.senderUsername ?? "?"} className="h-7 w-7 shrink-0 text-small" />
                  ) : (
                    <span className="h-7 w-7 shrink-0" aria-hidden />
                  ))}
                <MessageBubble
                  id={`msg-${m.id}`}
                  isMine={isMine}
                  body={m.body}
                  timeLabel={clockLabel(m.createdAt)}
                  statusLabel={
                    m.id === lastMineId
                      ? m.otherMemberCount === 0 || m.seenByCount === 0
                        ? "Sent"
                        : m.seenByCount >= m.otherMemberCount
                          ? "Seen by everyone"
                          : `Seen by ${m.seenByCount} of ${m.otherMemberCount}`
                      : undefined
                  }
                  showTime={meta.endsCluster}
                  endsCluster={meta.endsCluster}
                  senderLabel={!isMine && meta.startsCluster ? labelFor(m.senderId, currentUserId, m.senderName, m.senderUsername) : undefined}
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
            </div>
          );
        })}
        {typingNames.length > 0 && (
          <div className="mt-2">
            <GroupTypingIndicator typists={typingNames} size={28} />
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {replyingTo && (
        <div className="flex items-center gap-2 border-t border-ink/10 bg-neu-base shadow-pressed-low px-4 py-2">
          <div className="min-w-0 flex-1 border-l-2 border-[rgb(var(--c-s-50)/0.5)] pl-2">
            <p className="text-small font-medium text-slate-300">
              Replying to {labelFor(replyingTo.senderId, currentUserId, replyingTo.senderName, replyingTo.senderUsername)}
            </p>
            <p className="truncate text-small text-slate-500">{replyingTo.body}</p>
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

      <ComposerBar
        formRef={formRef}
        textareaRef={textareaRef}
        value={draft}
        onChange={handleDraftChange}
        onFocusChange={setComposerFocused}
        onKeyDown={handleKeyDown}
        onSubmit={handleSubmit}
        sending={sending}
        maxHeight={MAX_COMPOSE_HEIGHT_PX}
      />
    </div>
  );
}
