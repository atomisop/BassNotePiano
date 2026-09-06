"use client";

import type { GroupSummary } from "@/lib/groupMessages";
import { GroupAvatar } from "./GroupAvatar";

function groupTitle(group: GroupSummary): string {
  if (group.name) return group.name;
  if (group.memberNames.length === 0) return "Group";
  return group.memberNames.join(", ");
}

export function GroupListItem({ group, active, onSelect }: { group: GroupSummary; active: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full min-w-0 items-center gap-2.5 rounded-lg p-2.5 text-left transition ${
        active ? "bg-[rgb(var(--c-s-50)/0.1)]" : "hover:bg-ink/5"
      }`}
    >
      <GroupAvatar className="h-9 w-9" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm text-slate-100">{groupTitle(group)}</p>
          {group.unreadCount > 0 && (
            <span className="flex h-4 min-w-[1rem] shrink-0 items-center justify-center rounded-full bg-[rgb(var(--c-s-50))] px-1 text-[10px] font-bold text-slate-950">
              {group.unreadCount > 9 ? "9+" : group.unreadCount}
            </span>
          )}
        </div>
        <p className="truncate text-xs text-slate-500">
          {group.lastMessageBody ? `${group.lastMessageSenderName ?? "Someone"}: ${group.lastMessageBody}` : `${group.memberCount} members`}
        </p>
      </div>
    </button>
  );
}
