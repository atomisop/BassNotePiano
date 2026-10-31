"use client";

import type { GroupSummary } from "@/lib/groupMessages";
import { GroupListItem } from "./GroupListItem";
import { Plus } from "@/components/ui/appIcons";
import { ListSectionLabel } from "./ListSectionLabel";

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
    <div>
      <ListSectionLabel
        action={
        <button
          type="button"
          onClick={onNewGroup}
          aria-label="New group"
          className="tap flex h-8 w-8 items-center justify-center rounded-full bg-neu-base text-slate-300 shadow-raised-low transition hover:text-slate-50 active:shadow-pressed-low"
        >
          <Plus className="h-4 w-4" />
        </button>
        }
      >
        Groups
      </ListSectionLabel>

      {groups.length === 0 ? (
        !filtering && (
          <button type="button" onClick={onNewGroup} className="tap mx-2 flex w-[calc(100%-1rem)] items-center gap-3 rounded-2xl p-3 text-left transition hover:bg-neu-base/60">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-dashed border-slate-700 text-slate-400">
              <Plus className="h-4 w-4" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block text-body text-slate-100">Start a group</span>
              <span className="block text-small text-slate-500">Chat with a few friends at once</span>
            </span>
          </button>
        )
      ) : (
        <div className="space-y-1 p-2">
          {groups.map((g) => (
            <GroupListItem key={g.id} group={g} active={activeGroupId === g.id} onSelect={() => onSelect(g.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
