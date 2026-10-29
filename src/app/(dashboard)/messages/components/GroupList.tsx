"use client";

import type { GroupSummary } from "@/lib/groupMessages";
import { GroupListItem } from "./GroupListItem";

export function GroupList({
  groups,
  activeGroupId,
  onSelect,
  onNewGroup,
  filtering = false,
}: {
  groups: GroupSummary[];
  activeGroupId: string | null;
  onSelect: (groupId: string) => void;
  onNewGroup: () => void;
  /** A search is active: hide the empty-state copy rather than claim there are no groups. */
  filtering?: boolean;
}) {
  return (
    <div className="p-2">
      <div className="flex items-center justify-between px-2 pb-1.5 pt-3">
        <p className="text-small font-semibold uppercase tracking-caps text-slate-500">Groups</p>
        <button
          type="button"
          onClick={onNewGroup}
          aria-label="New group"
          className="tap flex h-8 w-8 items-center justify-center rounded-full bg-neu-base text-slate-300 shadow-raised-low transition hover:text-slate-50 active:shadow-pressed-low"
        >
          <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {groups.length === 0 ? (
        !filtering && <p className="px-2 py-2 text-small text-slate-500">No group chats yet.</p>
      ) : (
        <div className="space-y-1">
          {groups.map((g) => (
            <GroupListItem key={g.id} group={g} active={activeGroupId === g.id} onSelect={() => onSelect(g.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
