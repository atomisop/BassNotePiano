"use client";

import { useState } from "react";
import { motion, AnimatePresence, type PanInfo } from "framer-motion";
import type { ActiveAnnouncement } from "@/lib/announcements";
import { dismissAnnouncementAction } from "@/app/(dashboard)/notification-actions";
import { SPRING } from "@/lib/motionTokens";
import { Megaphone, X } from "@/components/ui/appIcons";

const SWIPE_DISMISS_THRESHOLD = 80;

/**
 * Sits between TopBar and <main> in the dashboard shell, a glass card at
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
          transition={SPRING.snappy}
          className="announcement-banner glass-surface-elevated mx-4 mt-4 flex shrink-0 cursor-grab items-start gap-3 p-4 active:cursor-grabbing md:mx-8"
        >
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-50/15 text-slate-50">
            <Megaphone className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-small font-medium text-slate-100">{announcement.title}</p>
            <p className="mt-0.5 text-small text-slate-400">{announcement.body}</p>
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Dismiss announcement"
            className="tap flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-ink/5 hover:text-slate-200"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
