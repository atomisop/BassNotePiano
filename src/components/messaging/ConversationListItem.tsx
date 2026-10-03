"use client";

import type { ConversationSummary } from "@/lib/messages";
import { Avatar } from "./Avatar";
import { PinIcon } from "./PinIcon";

export function ConversationListItem({
  conversation,
  active,
  onSelect,
  onTogglePin,
}: {
  conversation: ConversationSummary;
  active: boolean;
  onSelect: () => void;
  onTogglePin: () => void;
}) {
  const c = conversation;
  return (
    <div className={`group flex items-center gap-1 rounded-lg transition ${active ? "bg-neu-base shadow-pressed-low" : "hover:bg-ink/5"}`}>
      <button type="button" onClick={onSelect} className="flex min-w-0 flex-1 items-center gap-2.5 p-2.5 text-left">
        <Avatar image={c.friendImage} label={c.friendName ?? c.friendUsername ?? "?"} className="h-9 w-9 text-small" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-small text-slate-100">{c.friendName ?? `@${c.friendUsername}`}</p>
            {c.unreadCount > 0 && (
              <span className="flex h-4 min-w-[1rem] shrink-0 items-center justify-center rounded-full bg-slate-50 px-1 text-small font-bold text-slate-950">
                {c.unreadCount > 9 ? "9+" : c.unreadCount}
              </span>
            )}
          </div>
          <p className="truncate text-small">
            {c.isTyping ? <span className="text-[rgb(var(--c-s-50))]">typing…</span> : <span className="text-slate-500">{c.lastMessageBody}</span>}
          </p>
        </div>
      </button>
      <button
        type="button"
        onClick={onTogglePin}
        aria-label="Pin conversation"
        className="mr-1.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-slate-500 opacity-40 transition hover:bg-ink/5 hover:text-[rgb(var(--c-s-50))] hover:opacity-100 group-hover:opacity-100"
      >
        <PinIcon />
      </button>
    </div>
  );
}
