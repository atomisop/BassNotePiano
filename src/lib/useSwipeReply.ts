"use client";

import { useCallback, useRef, useState } from "react";
import { rubberband } from "@/lib/motion";

// How far right a bubble has to travel before releasing counts as "reply to
// this," and the ceiling its own resistance curve is measured against past
// that point (matching rubberband's own "size" parameter, see motion.ts).
// Dragging further than this just gets harder to do, it doesn't reveal
// anything new.
const REPLY_THRESHOLD_PX = 44;
const MAX_REVEAL_PX = 72;

export interface SwipeReply {
  /** Current horizontal offset, px: apply as translateX on the bubble. */
  dragX: number;
  /** True once this drag has crossed REPLY_THRESHOLD_PX: drives the reply-icon reveal. */
  armed: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
}

/**
 * Swipe-right-to-reply, iMessage/WhatsApp style: drag a message bubble
 * rightward, past a threshold it's "armed," and releasing while armed
 * starts a reply to that message. Always springs back to 0 on release,
 * armed or not: unlike useDismissDrag (whose whole point is the thing
 * actually leaving), nothing here should ever stay off its resting
 * position, the reply action is a side effect of the gesture, not the
 * gesture's destination.
 *
 * Deliberately not the same MotionValue/velocity-projection machinery
 * useDismissDrag uses: that's built for a dismiss animation that has to
 * feel thrown, this is a much smaller, always-returns-home motion where
 * plain state + a CSS transition reads just as well.
 */
export function useSwipeReply(onReply: () => void): SwipeReply {
  const [dragX, setDragX] = useState(0);
  const [armed, setArmed] = useState(false);
  const drag = useRef<{ id: number; startX: number; startY: number; locked: "x" | "y" | null } | null>(null);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    // A mouse never swipes: on a computer, reply is the hover button on the bubble (and dragging should select text).
    if (e.pointerType === "mouse") return;
    drag.current = { id: e.pointerId, startX: e.clientX, startY: e.clientY, locked: null };
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;

    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;

    // Decide once, on the first few pixels of real movement, whether this
    // gesture belongs to us (a horizontal swipe) or to the page's own
    // vertical scroll. Committing early and sticking with it is what
    // keeps a slightly-diagonal scroll gesture from also nudging the
    // bubble sideways for its first few frames.
    if (!d.locked) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      d.locked = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
    }
    if (d.locked === "y") return;

    e.currentTarget.setPointerCapture(e.pointerId);
    const clamped = dx <= 0 ? 0 : dx > MAX_REVEAL_PX ? MAX_REVEAL_PX + rubberband(dx - MAX_REVEAL_PX, MAX_REVEAL_PX) : dx;
    setDragX(clamped);
    setArmed(clamped >= REPLY_THRESHOLD_PX);
  }, []);

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const d = drag.current;
      if (!d || d.id !== e.pointerId) return;
      drag.current = null;
      if (armed) onReply();
      setDragX(0);
      setArmed(false);
    },
    [armed, onReply],
  );

  return { dragX, armed, onPointerDown, onPointerMove, onPointerUp };
}
