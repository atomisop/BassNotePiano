"use client";

import { useState } from "react";
import type { ConversationSummary } from "@/lib/messages";
import type { GroupSummary } from "@/lib/groupMessages";
import { PinnedGrid } from "@/components/messaging/PinnedGrid";
import { ConversationList } from "@/components/messaging/ConversationList";
import { GroupList } from "./GroupList";
import { groupTitle } from "./GroupListItem";

export function ConversationSidebar({
  conversations,
  groups,
  activeFriendId,
  activeGroupId,
  onSelect,
  onTogglePin,
  onSelectGroup,
  onNewGroup,
}: {
  conversations: ConversationSummary[];
  groups: GroupSummary[];
  activeFriendId: string | null;
  activeGroupId: string | null;
  onSelect: (friendId: string) => void;
  onTogglePin: (friendId: string) => void;
  onSelectGroup: (groupId: string) => void;
  onNewGroup: () => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const filteredConversations = q
    ? conversations.filter((c) => [c.friendName, c.friendUsername, c.lastMessageBody].some((v) => v?.toLowerCase().includes(q)))
    : conversations;
  const filteredGroups = q ? groups.filter((g) => groupTitle(g).toLowerCase().includes(q)) : groups;
  const nothingFound = q !== "" && filteredConversations.length === 0 && filteredGroups.length === 0;
  const pinned = filteredConversations.filter((c) => c.isPinned).sort((a, b) => (a.pinOrder ?? 0) - (b.pinOrder ?? 0));
  const rest = filteredConversations.filter((c) => !c.isPinned);

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto md:w-[350px] md:shrink-0 md:border-r md:border-ink/10">
      <div className="px-4 pb-3 pt-4">
        <p className="text-small font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50)/0.8)]">Social</p>
        <h1 className="font-hero text-hero font-bold text-balance mt-1 text-slate-50">Messages</h1>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search messages"
          aria-label="Search conversations"
          className="mt-3 h-11 w-full rounded-full border border-(--neu-edge) bg-neu-base px-4 text-body text-slate-100 shadow-pressed-low outline-none transition placeholder:text-slate-500 focus:border-signal"
        />
      </div>
      <PinnedGrid pinned={pinned} activeFriendId={activeFriendId} onSelect={onSelect} onTogglePin={onTogglePin} />
      <ConversationList conversations={rest} activeFriendId={activeFriendId} onSelect={onSelect} onTogglePin={onTogglePin} />
      {nothingFound && <p className="px-4 py-6 text-center text-small text-slate-500">Nothing matches that search.</p>}
      <GroupList groups={filteredGroups} activeGroupId={activeGroupId} onSelect={onSelectGroup} onNewGroup={onNewGroup} filtering={q !== ""} />
    </div>
  );
}
