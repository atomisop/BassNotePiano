"use client";

import { useCallback, useRef } from "react";
import { animate, useMotionValue, type MotionValue } from "framer-motion";
import { project, rubberband, velocityFrom, type PointerSample } from "@/lib/motion";

/**
 * Drag-to-dismiss for sheets and panels.
 *
 * A sheet that only opens and closes on tap is a dialog wearing a sheet's
 * clothes, the shape promises it can be pushed away, and then it can't. This
 * gives every sheet the physics the shape implies:
 *
 *   • 1:1 tracking in the dismiss direction while the pointer is down
 *   • resistance in the wrong direction rather than a dead stop, so pulling
 *     against the sheet still feels like touching something
 *   • the decision to dismiss made from where the flick is *going*, not from
 *     how far it happened to get, a short fast flick dismisses, a long slow
 *     drag that stops halfway springs back
 *   • the closing animation seeded with the pointer's release velocity, so
 *     there's no seam where the finger stops and the animation starts
 *   • grabbable mid-animation: pressing again takes over the live value
 *
 * `axis` is the direction the sheet leaves in, "y" for a bottom sheet,
 * "x" for a right-hand panel. Dismissal is always positive along that axis,
 * which keeps enter and exit on the same path.
 */
export interface DismissDragOptions {
  axis: "x" | "y";
  /** Called once the sheet has committed to leaving. */
  onDismiss: () => void;
  /** Size of the sheet along `axis`, in px, used for resistance and the exit distance. */
  size: number;
  /** Fraction of `size` the projected endpoint must pass to dismiss. */
  threshold?: number;
}

export interface DismissDrag {
  offset: MotionValue<number>;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
}

export function useDismissDrag({ axis, onDismiss, size, threshold = 0.4 }: DismissDragOptions): DismissDrag {
  const offset = useMotionValue(0);
  const drag = useRef<{ id: number; start: number; startOffset: number; samples: PointerSample[]; moved: boolean } | null>(
    null,
  );

  const coord = useCallback((e: React.PointerEvent) => (axis === "y" ? e.clientY : e.clientX), [axis]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Don't hijack drags that belong to scrollable content inside the sheet.
      const scrollable = (e.target as HTMLElement).closest("[data-sheet-scroll]");
      if (scrollable && scrollable.scrollTop > 0) return;

      offset.stop();
      // No pointer capture yet. Capturing on press retargets the matching
      // pointerup (and so the click) to this container, which silently ate
      // every tap on the Back button and any other control inside the sheet.
      // Capture is taken only once the press has turned into a real drag.
      drag.current = {
        id: e.pointerId,
        start: coord(e),
        startOffset: offset.get(),
        samples: [{ value: coord(e), time: performance.now() }],
        moved: false,
      };
    },
    [coord, offset],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const d = drag.current;
      if (!d || d.id !== e.pointerId) return;

      const delta = coord(e) - d.start;
      d.samples.push({ value: coord(e), time: performance.now() });
      if (d.samples.length > 12) d.samples.shift();

      if (!d.moved && Math.abs(delta) < 8) return;
      if (!d.moved) {
        try {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        } catch {
          // The pointer may already be gone; the drag still tracks via move events.
        }
      }
      d.moved = true;

      let next = d.startOffset + delta;
      // Pulling the sheet further *into* the screen has nowhere to go, so it
      // resists instead of stopping dead.
      if (next < 0) next = -rubberband(-next, size);
      offset.set(next);
    },
    [coord, offset, size],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const d = drag.current;
      if (!d || d.id !== e.pointerId) return;
      drag.current = null;
      if (!d.moved) return;

      const velocity = velocityFrom(d.samples);
      const projected = offset.get() + project(velocity);

      if (projected > size * threshold) {
        // Commit. Finish the journey the finger started, at its own speed.
        animate(offset, size, { type: "spring", bounce: 0, duration: 0.3, velocity });
        onDismiss();
      } else {
        // Settle back. Bounce is earned, the sheet was thrown and caught.
        animate(offset, 0, { type: "spring", bounce: 0.18, duration: 0.4, velocity });
      }
    },
    [offset, onDismiss, size, threshold],
  );

  return { offset, onPointerDown, onPointerMove, onPointerUp };
}
