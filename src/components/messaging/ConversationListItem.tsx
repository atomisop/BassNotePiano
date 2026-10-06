"use client";

import type { ConversationSummary } from "@/lib/messages";
import { Avatar } from "./Avatar";
import { PinIcon } from "./PinIcon";
import { listStamp } from "./threadUi";

export function UnreadBadge({ count }: { count: number }) {
  return (
    <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-signal px-1.5 text-small font-bold text-slate-950">
      {count > 9 ? "9+" : count}
    </span>
  );
}

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
  const stamp = listStamp(c.lastMessageAt);
  return (
    <div
      className={`group flex items-center rounded-2xl transition ${
        active ? "bg-neu-base shadow-pressed-low" : "hover:shadow-raised-low"
      }`}
    >
      <button type="button" onClick={onSelect} className="tap flex min-w-0 flex-1 items-center gap-3 p-3 text-left">
        <Avatar userId={c.friendId} image={c.friendImage} label={c.friendName ?? c.friendUsername ?? "?"} className="h-11 w-11 text-body" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className={`truncate text-body ${c.unreadCount > 0 ? "font-semibold text-slate-50" : "text-slate-100"}`}>
              {c.friendName ?? `@${c.friendUsername}`}
            </p>
            {stamp && <span className="shrink-0 text-small text-slate-500">{stamp}</span>}
          </div>
          <div className="mt-0.5 flex items-center justify-between gap-2">
            <p className="truncate text-small">
              {c.isTyping ? (
                <span className="text-[rgb(var(--c-s-50))]">typing…</span>
              ) : (
                <span className={c.unreadCount > 0 ? "text-slate-300" : "text-slate-500"}>{c.lastMessageBody ?? "No messages yet"}</span>
              )}
            </p>
            {c.unreadCount > 0 && <UnreadBadge count={c.unreadCount} />}
          </div>
        </div>
      </button>
      <button
        type="button"
        onClick={onTogglePin}
        aria-label="Pin conversation"
        className="tap mr-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-500 opacity-60 transition hover:text-[rgb(var(--c-s-50))] hover:opacity-100 md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100"
      >
        <PinIcon />
      </button>
    </div>
  );
}
