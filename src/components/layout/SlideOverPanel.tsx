"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useDismissDrag } from "@/lib/useDismissDrag";
import { useDialogFocus } from "@/hooks/useDialogFocus";
import { FADE, SPRING } from "@/lib/motionTokens";
import { ChevronLeft } from "@/components/ui/appIcons";

/**
 * Shared "push navigation" panel, full-screen on phones, a right-anchored
 * drawer on md+ so it never fully covers a spacious screen. Portaled to
 * document.body for the same reason NotificationBell is: a backdrop-blur
 * ancestor creates a CSS containing block that traps position:fixed
 * descendants inside its own tiny box otherwise.
 */
export function SlideOverPanel({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const titleId = useId();
  const dialogRef = useDialogFocus<HTMLDivElement>(open);

  // The panel is full-width on phones and capped at md:max-w-md above that,
  // so the dismiss distance has to be measured rather than assumed.
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelWidth, setPanelWidth] = useState(420);
  useLayoutEffect(() => {
    if (open && panelRef.current) setPanelWidth(panelRef.current.offsetWidth || 420);
  }, [open]);

  const dismiss = useDismissDrag({ axis: "x", size: panelWidth, onDismiss: onClose });

  useEffect(() => {
    if (open) dismiss.offset.set(0);
  }, [open, dismiss.offset]);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        // h-[100svh], not inset-0's own implicit bottom:0 sizing. Same
        // fix as QuizModal's own full-screen panel (see its comment): a
        // position:fixed element sized against Safari's own *large*
        // viewport (as if the toolbar were always hidden) can leave a gap
        // or get clipped once the toolbar's actually showing, and this app
        // shell already hit that exact bug once before, see
        // (dashboard)/layout.tsx's own h-[100svh] comment.
        <motion.div className="kb-fit fixed inset-x-0 top-0 z-50 flex h-[100svh] w-full justify-end" initial="hidden" animate="visible" exit="hidden">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={FADE}
            className="absolute inset-0 bg-scrim/40"
            onClick={onClose}
          />
          <motion.div
            ref={panelRef}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={SPRING.snappy}
            // Fully opaque white sheet, no backdrop-blur anywhere in the
            // paper system. Blur behind a sliding panel meant re-blurring
            // whatever moved underneath on every frame of the spring, which
            // was exactly the "framy when I open something" feel.
            style={{ willChange: "transform" }}
            className="relative h-full w-full md:max-w-md"
          >
            {/* Enter/exit on the parent, drag offset here, the panel leaves
                the way it arrived, so pushing it right is the same path the
                close button animates along. */}
            <motion.div
              style={{ x: dismiss.offset, willChange: "transform" }}
              onPointerDown={dismiss.onPointerDown}
              onPointerMove={dismiss.onPointerMove}
              onPointerUp={dismiss.onPointerUp}
              onPointerCancel={dismiss.onPointerUp}
              ref={dialogRef}
              tabIndex={-1}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              className="relative flex h-full w-full flex-col border-l border-ink/10 bg-surface"
            >
            <div className="flex items-center gap-4 border-b border-ink/10 px-6 py-5">
              <button
                type="button"
                onClick={onClose}
                aria-label="Back"
                className="tap flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-300 transition bg-neu-base shadow-raised-low hover:shadow-raised-mid active:shadow-pressed-low"
              >
                <ChevronLeft className="h-[18px] w-[18px]" />
              </button>
              <h1 id={titleId} className="font-hero text-hero font-bold text-balance truncate text-slate-50">{title}</h1>
            </div>
            {/* overscroll-contain: this panel is portaled straight to
                document.body and sits above literally everything else
                (z-50), with its own static header row (the Back button/
                title above) that never scrolls. Without this, scrolling
                this content to the bottom and flinging back up past the
                top rubber-bands right here. On iOS that bounce can
                visibly slide the scrolled content up over the static
                header for an instant before it springs back, reported live
                as "it bounces back and covers a little bit of the top."
                Same fix (dashboard)/layout.tsx already applies to its own
                <main>, for the exact same reason. */}
            <div data-sheet-scroll className="flex-1 overflow-y-auto overscroll-contain p-6">{children}</div>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
