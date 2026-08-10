"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useDismissDrag } from "@/lib/useDismissDrag";

/**
 * Shared "push navigation" panel — full-screen on phones, a right-anchored
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
        <motion.div className="fixed inset-0 z-50 flex justify-end" initial="hidden" animate="visible" exit="hidden">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-scrim/40"
            onClick={onClose}
          />
          <motion.div
            ref={panelRef}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", bounce: 0, duration: 0.3 }}
            // Fully opaque white sheet — no backdrop-blur anywhere in the
            // paper system. Blur behind a sliding panel meant re-blurring
            // whatever moved underneath on every frame of the spring, which
            // was exactly the "framy when I open something" feel.
            style={{ willChange: "transform" }}
            className="relative h-full w-full md:max-w-md"
          >
            {/* Enter/exit on the parent, drag offset here — the panel leaves
                the way it arrived, so pushing it right is the same path the
                close button animates along. */}
            <motion.div
              style={{ x: dismiss.offset, willChange: "transform" }}
              onPointerDown={dismiss.onPointerDown}
              onPointerMove={dismiss.onPointerMove}
              onPointerUp={dismiss.onPointerUp}
              onPointerCancel={dismiss.onPointerUp}
              className="relative flex h-full w-full flex-col border-l border-ink/10 bg-surface"
            >
            <div className="flex items-center gap-4 border-b border-ink/10 px-6 py-5">
              <button
                type="button"
                onClick={onClose}
                aria-label="Back"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-ink/10 text-slate-300 transition hover:border-ink/15 hover:bg-ink/5"
              >
                <svg viewBox="0 0 24 24" fill="none" className="h-[18px] w-[18px]">
                  <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <h1 className="truncate font-serif text-lg text-slate-50">{title}</h1>
            </div>
            <div data-sheet-scroll className="flex-1 overflow-y-auto p-6">{children}</div>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
