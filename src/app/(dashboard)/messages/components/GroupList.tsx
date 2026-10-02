"use client";

import type { GroupSummary } from "@/lib/groupMessages";
import { GroupListItem } from "./GroupListItem";

export function GroupList({
  groups,
  activeGroupId,
  onSelect,
  onNewGroup,
}: {
  groups: GroupSummary[];
  activeGroupId: string | null;
  onSelect: (groupId: string) => void;
  onNewGroup: () => void;
}) {
  return (
    <div className="border-t border-ink/10 p-2">
      <div className="flex items-center justify-between px-2.5 py-1.5">
        <p className="text-small font-medium uppercase tracking-[0.15em] text-slate-600">Groups</p>
        <button
          type="button"
          onClick={onNewGroup}
          aria-label="New group"
          className="flex h-6 w-6 items-center justify-center rounded-full text-slate-500 transition hover:bg-ink/5 hover:text-[rgb(var(--c-s-50))]"
        >
          <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {groups.length === 0 ? (
        <p className="px-2.5 py-2 text-small text-slate-600">No group chats yet.</p>
      ) : (
        <div className="space-y-0.5">
          {groups.map((g) => (
            <GroupListItem key={g.id} group={g} active={activeGroupId === g.id} onSelect={() => onSelect(g.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
