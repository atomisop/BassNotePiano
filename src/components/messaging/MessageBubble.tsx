"use client";

import { useEffect, useRef, useState } from "react";
import { Reply } from "lucide-react";
import { motion } from "framer-motion";
import { REACTION_EMOJI } from "@/lib/reactions";
import { AttachmentButton } from "@/components/ui/attachment-button";
import { EmojiPicker, EmojiPickerContent, EmojiPickerSearch } from "@/components/ui/emoji-picker";
import { useSwipeReply } from "@/lib/useSwipeReply";
import { ReplyArrowIcon, SmileyPlusIcon } from "@/components/ui/icons";
import { SPRING } from "@/lib/motionTokens";

// Hold time before the reaction row opens, and how far a finger may drift before it counts as a swipe/scroll instead.
const LONG_PRESS_MS = 420;
const HOLD_MOVE_TOLERANCE_PX = 8;

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
  showTime = true,
  statusLabel,
  endsCluster = true,
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
  /** Only the last bubble of a run shows its time; earlier ones stay compact. */
  showTime?: boolean;
  /** Delivery line under my latest message ("Sent", "Seen 3:42 PM"), decided by the server. */
  statusLabel?: string;
  /** Last bubble of a run gets the squared tail corner. */
  endsCluster?: boolean;
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
  const [customOpen, setCustomOpen] = useState(false);

  function closePicker() {
    setPickerOpen(false);
    setCustomOpen(false);
  }

  const swipe = useSwipeReply(onReplyStart);

  // Long-press (touch or pen) opens the reaction row, like iMessage's Tapback.
  // Any real movement cancels it, so a swipe-to-reply or a scroll never opens
  // the picker; a mouse keeps the hover button instead.
  const holdTimer = useRef<number | null>(null);
  const holdStart = useRef<{ x: number; y: number } | null>(null);
  const lastPointerType = useRef<string>("mouse");
  function cancelHold() {
    if (holdTimer.current !== null) window.clearTimeout(holdTimer.current);
    holdTimer.current = null;
    holdStart.current = null;
  }
  useEffect(() => cancelHold, []);

  function onHoldDown(e: React.PointerEvent) {
    swipe.onPointerDown(e);
    lastPointerType.current = e.pointerType;
    if (e.pointerType === "mouse") return;
    holdStart.current = { x: e.clientX, y: e.clientY };
    holdTimer.current = window.setTimeout(() => {
      holdTimer.current = null;
      setPickerOpen(true);
      if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(12);
    }, LONG_PRESS_MS);
  }
  function onHoldMove(e: React.PointerEvent) {
    const start = holdStart.current;
    if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > HOLD_MOVE_TOLERANCE_PX) cancelHold();
    swipe.onPointerMove(e);
  }
  function onHoldUp(e: React.PointerEvent) {
    cancelHold();
    swipe.onPointerUp(e);
  }

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
          onPointerDown={onHoldDown}
          onPointerMove={onHoldMove}
          onPointerUp={onHoldUp}
          onPointerCancel={onHoldUp}
          // Stop the OS long-press menu / text-selection callout so only the reaction row opens.
          onContextMenu={(e) => {
            if (lastPointerType.current !== "mouse") e.preventDefault();
          }}
          animate={{ x: swipe.dragX }}
          transition={swipe.dragX === 0 ? SPRING.lively : { duration: 0 }}
          style={{ touchAction: "pan-y" }}
          className={`min-w-0 select-none rounded-2xl px-3.5 py-2 text-body [-webkit-touch-callout:none] md:select-text ${
            isMine
              ? `bg-[rgb(var(--signal)/0.16)] text-slate-50 shadow-raised-low ${endsCluster ? "rounded-br-md" : ""}`
              : `bg-neu-base text-slate-100 shadow-raised-low ${endsCluster ? "rounded-bl-md" : ""}`
          }`}
        >
          {reply && (
            <button
              type="button"
              onClick={() => onJumpToReply?.(reply.id)}
              className={`tap mb-1.5 block w-full rounded-lg border-l-2 px-2 py-1 text-left text-small ${
                "border-[rgb(var(--c-s-50)/0.4)] bg-ink/5"
              }`}
            >
              <p className="font-medium">{reply.senderLabel}</p>
              <p className="truncate opacity-80">{reply.body}</p>
            </button>
          )}
          <p className="whitespace-pre-wrap break-words">{body}</p>
          {showTime && <p className="mt-1 text-right text-small text-slate-400">{timeLabel}</p>}
        </motion.div>

        {/* Always-present, not hover-only: hover has no equivalent on
            touch, and this is the one reliable way to react on either. */}
        {/* Computers only (md+): reply on hover, since a mouse can't swipe. */}
        <button
          type="button"
          onClick={onReplyStart}
          aria-label="Reply"
          className="tap hidden h-6 w-6 shrink-0 items-center justify-center rounded-full text-slate-500 opacity-0 transition hover:text-slate-300 group-hover/bubble:opacity-100 focus-visible:opacity-100 md:flex"
        >
          <Reply size={15} />
        </button>
        <button
          type="button"
          onClick={() => setPickerOpen((v) => !v)}
          aria-label="React"
          className="tap hit-slop flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-slate-500 opacity-60 transition hover:text-slate-300 md:opacity-0 md:group-hover/bubble:opacity-100 focus-visible:opacity-100"
        >
          <SmileyPlusIcon size={15} />
        </button>
      </div>

      {statusLabel && isMine && <p className="mt-0.5 px-1 text-small text-slate-500">{statusLabel}</p>}

      {pickerOpen && (
        <div className="mt-1.5 max-w-full rounded-3xl bg-neu-base p-1.5 shadow-raised-high">
          <div className="flex flex-wrap gap-0.5">
            {REACTION_EMOJI.map((emoji) => (
              <button
                key={emoji}
                type="button"
                aria-label={`React ${emoji}`}
                onClick={() => {
                  onReact(emoji);
                  closePicker();
                }}
                className={`tap flex h-9 w-9 items-center justify-center rounded-full text-body leading-none transition ${
                  myReaction === emoji ? "bg-neu-base shadow-pressed-low" : "hover:shadow-raised-low"
                }`}
              >
                {emoji}
              </button>
            ))}
            <AttachmentButton label="Choose any emoji" expanded={customOpen} onClick={() => setCustomOpen((v) => !v)} />
          </div>
          {customOpen && (
            <div className="mt-1.5 h-72 w-[min(20rem,calc(100vw-3rem))] overflow-hidden rounded-2xl shadow-pressed-low">
              <EmojiPicker
                onEmojiSelect={({ emoji }) => {
                  onReact(emoji);
                  closePicker();
                }}
              >
                <EmojiPickerSearch />
                <EmojiPickerContent />
              </EmojiPicker>
            </div>
          )}
        </div>
      )}

      {counts.size > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {Array.from(counts.entries()).map(([emoji, count]) => (
            <button
              key={emoji}
              type="button"
              onClick={() => onReact(emoji)}
              aria-label={`${emoji}${count > 1 ? `, ${count} reactions` : ""}${myReaction === emoji ? ", yours" : ""}`}
              aria-pressed={myReaction === emoji}
              className={`tap rounded-full bg-neu-base px-2 py-1 text-small leading-none transition ${
                myReaction === emoji ? "text-slate-100 shadow-pressed-low" : "text-slate-400 shadow-raised-low"
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
