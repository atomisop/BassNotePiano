"use client";

import { useState } from "react";
import { motion, AnimatePresence, type PanInfo } from "framer-motion";
import type { ActiveAnnouncement } from "@/lib/announcements";
import { dismissAnnouncementAction } from "@/app/(dashboard)/notification-actions";

const SWIPE_DISMISS_THRESHOLD = 80;

/**
 * Sits between TopBar and <main> in the dashboard shell — a glass card at
 * the top of the content area that's both the "banner" (stays until acted
 * on) and the "popup" (drag/swipe in any direction past the threshold, or
 * the explicit close button, to dismiss). One dismissal is permanent for
 * this announcement; it never reappears once swiped or closed. Separate
 * from the bell entry the same announcement also creates, which has its
 * own independent read/unread state.
 */
export function AnnouncementBanner({ announcement }: { announcement: ActiveAnnouncement | null }) {
  const [dismissed, setDismissed] = useState(false);

  if (!announcement || dismissed) return null;

  async function handleDismiss() {
    setDismissed(true);
    await dismissAnnouncementAction(announcement!.id);
  }

  function handleDragEnd(_: unknown, info: PanInfo) {
    if (Math.abs(info.offset.x) > SWIPE_DISMISS_THRESHOLD || Math.abs(info.offset.y) > SWIPE_DISMISS_THRESHOLD) {
      void handleDismiss();
    }
  }

  return (
    <AnimatePresence>
      {!dismissed && (
        <motion.div
          key={announcement.id}
          drag
          dragConstraints={{ top: 0, bottom: 0, left: 0, right: 0 }}
          dragElastic={0.6}
          onDragEnd={handleDragEnd}
          initial={{ opacity: 0, y: -16, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -16, scale: 0.97 }}
          transition={{ type: "spring", stiffness: 320, damping: 30 }}
          className="glass-surface-elevated mx-4 mt-4 flex shrink-0 cursor-grab items-start gap-3 p-4 active:cursor-grabbing md:mx-8"
        >
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-400/15 text-amber-300">
            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
              <path
                d="M12 3a5 5 0 00-5 5v2.7c0 .57-.19 1.13-.53 1.58L5 14.5c-.94 1.24-.06 3 1.49 3h11.02c1.55 0 2.43-1.76 1.49-3l-1.47-2.22a2.67 2.67 0 01-.53-1.58V8a5 5 0 00-5-5z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-100">{announcement.title}</p>
            <p className="mt-0.5 text-sm text-slate-400">{announcement.body}</p>
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Dismiss announcement"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-white/5 hover:text-slate-200"
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            </svg>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
