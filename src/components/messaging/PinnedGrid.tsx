"use client";

import { motion } from "framer-motion";
import type { ConversationSummary } from "@/lib/messages";
import { Avatar } from "./Avatar";
import { PinIcon } from "./PinIcon";
import { TypingIndicator } from "./TypingIndicator";

function truncateSnippet(text: string, max = 16): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function PinnedGrid({
  pinned,
  activeFriendId,
  onSelect,
  onTogglePin,
}: {
  pinned: ConversationSummary[];
  activeFriendId: string | null;
  onSelect: (friendId: string) => void;
  onTogglePin: (friendId: string) => void;
}) {
  if (pinned.length === 0) return null;

  return (
    <div className="grid grid-cols-3 gap-x-2 gap-y-4 border-b border-ink/10 p-3">
      {pinned.map((c) => {
        const showBadge = c.isTyping || c.unreadCount > 0;
        const active = activeFriendId === c.friendId;
        return (
          <motion.div key={c.friendId} layout layoutId={`conv-${c.friendId}`} className="relative flex flex-col items-center gap-1.5">
            <div className="relative">
              <button
                type="button"
                onClick={() => onSelect(c.friendId)}
                className={`overflow-hidden rounded-full border-2 transition ${
                  active ? "border-amber-400" : "border-transparent bg-neu-base shadow-raised-low"
                }`}
              >
                <Avatar image={c.friendImage} label={c.friendName ?? c.friendUsername ?? "?"} className="h-16 w-16 text-body font-semibold" />
              </button>

              {showBadge && (
                <span
                  className={`absolute -right-2 -top-1 flex max-w-[6rem] items-center justify-center rounded-full border border-ink/10 px-2 py-1 text-small font-medium shadow-raised-mid ${
                    c.isTyping ? "bg-[rgb(var(--c-s-50))] text-slate-950" : "bg-surface text-slate-100"
                  }`}
                >
                  {c.isTyping ? <TypingIndicator /> : truncateSnippet(c.lastMessageBody ?? "")}
                </span>
              )}

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onTogglePin(c.friendId);
                }}
                aria-label="Unpin conversation"
                className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full text-[rgb(var(--c-s-50))] shadow transition hover:bg-slate-900 hover:opacity-70 bg-neu-base shadow-raised-low hover:shadow-raised-mid active:shadow-pressed-low"
              >
                <PinIcon filled className="h-3 w-3" />
              </button>
            </div>

            <p className="max-w-[4.5rem] truncate text-center text-small text-slate-400">
              {c.friendName ?? `@${c.friendUsername}`}
            </p>
          </motion.div>
        );
      })}
    </div>
  );
}
