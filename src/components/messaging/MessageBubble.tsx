"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { REACTION_EMOJI } from "@/lib/reactions";
import { useSwipeReply } from "@/lib/useSwipeReply";
import { ReplyArrowIcon, SmileyPlusIcon } from "@/components/ui/icons";

export interface BubbleReply {
  id: string;
  /** Precomputed by the caller ("You" or the original sender's display name): this component doesn't know how to resolve a sender id to a name. */
  senderLabel: string;
  body: string;
}

export interface BubbleReaction {
  userId: string;
  emoji: string;
}

/**
 * One message bubble, shared by ChatWindow (1:1) and GroupChatWindow: the
 * swipe-to-reply gesture, the reaction picker, the reply-quote preview, and
 * the little reaction-count pills underneath, all in one place rather than
 * duplicated across both call sites. Unlike the "duplicated on purpose"
 * small helpers elsewhere in this codebase, this is real gesture logic,
 * worth sharing.
 */
export function MessageBubble({
  id,
  isMine,
  body,
  timeLabel,
  senderLabel,
  reply,
  reactions,
  currentUserId,
  onReplyStart,
  onReact,
  onJumpToReply,
}: {
  /** DOM id for scrollIntoView from a reply-quote tap elsewhere in the thread, see onJumpToReply. */
  id?: string;
  isMine: boolean;
  body: string;
  timeLabel: string;
  /** Group chat only: the sender's display name, shown above the bubble for messages that aren't mine. 1:1 chat leaves this unset since the thread header already establishes who's who. */
  senderLabel?: string;
  reply: BubbleReply | null;
  reactions: BubbleReaction[];
  currentUserId: string;
  /** Swiped right past the threshold, or tapped the reply icon: start composing a reply to this message. */
  onReplyStart: () => void;
  onReact: (emoji: string) => void;
  /** Tapped the quoted preview inside this bubble: scroll to the original. Undefined originals (deleted, or just not loaded) simply don't get a handler. */
  onJumpToReply?: (messageId: string) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const swipe = useSwipeReply(onReplyStart);

  const myReaction = reactions.find((r) => r.userId === currentUserId)?.emoji ?? null;
  const counts = new Map<string, number>();
  for (const r of reactions) counts.set(r.emoji, (counts.get(r.emoji) ?? 0) + 1);

  return (
    <div id={id} className={`flex flex-col ${isMine ? "items-end" : "items-start"}`}>
      {senderLabel && <p className="mb-0.5 max-w-[220px] truncate px-1 text-small text-slate-500">{senderLabel}</p>}
      <div className="group/bubble relative flex max-w-[85%] items-center gap-1.5" style={{ touchAction: "pan-y" }}>
        {/* Reply icon, revealed behind the bubble as it's dragged right, not
            a fixed button: it tracks the same offset so it reads as
            "sliding out from underneath," the same affordance iMessage/
            WhatsApp both use. */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-0 flex items-center text-[rgb(var(--c-s-50))] transition-opacity"
          style={{ opacity: swipe.dragX > 10 ? Math.min(1, swipe.dragX / 44) : 0 }}
        >
          <ReplyArrowIcon size={16} />
        </div>

        <motion.div
          onPointerDown={swipe.onPointerDown}
          onPointerMove={swipe.onPointerMove}
          onPointerUp={swipe.onPointerUp}
          onPointerCancel={swipe.onPointerUp}
          animate={{ x: swipe.dragX }}
          transition={swipe.dragX === 0 ? { type: "spring", bounce: 0.2, duration: 0.35 } : { duration: 0 }}
          style={{ touchAction: "pan-y" }}
          className={`min-w-0 rounded-2xl px-3.5 py-2 text-body ${
            isMine ? "bg-[rgb(var(--c-s-50))] text-slate-950" : "border border-ink/10 bg-slate-950 text-slate-100"
          }`}
        >
          {reply && (
            <button
              type="button"
              onClick={() => onJumpToReply?.(reply.id)}
              className={`mb-1.5 block w-full rounded-lg border-l-2 px-2 py-1 text-left text-small ${
                isMine ? "border-slate-950/30 bg-slate-950/10" : "border-[rgb(var(--c-s-50)/0.4)] bg-white/5"
              }`}
            >
              <p className="font-medium">{reply.senderLabel}</p>
              <p className="truncate opacity-80">{reply.body}</p>
            </button>
          )}
          <p className="whitespace-pre-wrap break-words">{body}</p>
          <p className={`mt-1 text-small ${isMine ? "text-slate-950/60" : "text-slate-600"}`}>{timeLabel}</p>
        </motion.div>

        {/* Always-present, not hover-only: hover has no equivalent on
            touch, and this is the one reliable way to react on either. */}
        <button
          type="button"
          onClick={() => setPickerOpen((v) => !v)}
          aria-label="React"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-slate-600 opacity-0 transition hover:text-slate-300 group-hover/bubble:opacity-100 focus-visible:opacity-100"
        >
          <SmileyPlusIcon size={15} />
        </button>
      </div>

      {pickerOpen && (
        <div className="mt-1 flex gap-0.5 rounded-full border border-ink/10 bg-slate-900 p-1 shadow-lg">
          {REACTION_EMOJI.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => {
                onReact(emoji);
                setPickerOpen(false);
              }}
              className={`rounded-full px-1.5 py-0.5 text-body leading-none transition hover:bg-white/10 ${
                myReaction === emoji ? "bg-[rgb(var(--c-s-50)/0.15)]" : ""
              }`}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {counts.size > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {Array.from(counts.entries()).map(([emoji, count]) => (
            <button
              key={emoji}
              type="button"
              onClick={() => onReact(emoji)}
              className={`rounded-full border px-1.5 py-0.5 text-small leading-none transition ${
                myReaction === emoji
                  ? "border-[rgb(var(--c-s-50)/0.6)] bg-[rgb(var(--c-s-50)/0.1)]"
                  : "border-ink/10 text-slate-400 hover:border-ink/15"
              }`}
            >
              {emoji}
              {count > 1 ? ` ${count}` : ""}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
