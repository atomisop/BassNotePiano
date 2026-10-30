"use client";

import type { GroupSummary } from "@/lib/groupMessages";
import { GroupListItem } from "./GroupListItem";
import { Plus } from "@/components/ui/appIcons";

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
          <Plus className="h-4 w-4" />
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
