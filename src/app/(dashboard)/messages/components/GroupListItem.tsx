"use client";

import type { GroupSummary } from "@/lib/groupMessages";
import { UnreadBadge } from "@/components/messaging/ConversationListItem";
import { listStamp } from "@/components/messaging/threadUi";
import { GroupAvatar } from "./GroupAvatar";

export function groupTitle(group: GroupSummary): string {
  if (group.name) return group.name;
  if (group.memberNames.length === 0) return "Group";
  return group.memberNames.join(", ");
}

export function GroupListItem({ group, active, onSelect }: { group: GroupSummary; active: boolean; onSelect: () => void }) {
  const stamp = listStamp(group.lastMessageAt);
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`tap flex w-full min-w-0 items-center gap-3 rounded-2xl p-3 text-left transition ${
        active ? "bg-signal/12" : "hover:bg-slate-800/40"
      }`}
    >
      <GroupAvatar className="h-11 w-11" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className={`truncate text-body ${group.unreadCount > 0 ? "font-semibold text-slate-50" : "text-slate-100"}`}>{groupTitle(group)}</p>
          {stamp && <span className="shrink-0 text-small text-slate-500">{stamp}</span>}
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <p className={`truncate text-small ${group.unreadCount > 0 ? "text-slate-300" : "text-slate-500"}`}>
            {group.lastMessageBody ? `${group.lastMessageSenderName ?? "Someone"}: ${group.lastMessageBody}` : `${group.memberCount} members`}
          </p>
          {group.unreadCount > 0 && <UnreadBadge count={group.unreadCount} />}
        </div>
      </div>
    </button>
  );
}
