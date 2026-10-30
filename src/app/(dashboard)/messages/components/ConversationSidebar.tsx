"use client";

import { useState } from "react";
import { LifeBuoy } from "lucide-react";
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
  support,
  supportActive,
  onSelectSupport,
}: {
  conversations: ConversationSummary[];
  groups: GroupSummary[];
  activeFriendId: string | null;
  activeGroupId: string | null;
  onSelect: (friendId: string) => void;
  onTogglePin: (friendId: string) => void;
  onSelectGroup: (groupId: string) => void;
  onNewGroup: () => void;
  /** The person's Support conversation, pinned above the rest. Null for the admin. */
  support: { preview: string | null; unread: number } | null;
  supportActive: boolean;
  onSelectSupport: () => void;
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
    <div className="flex h-full w-full flex-col overflow-y-auto md:w-[350px] md:shrink-0 md:neu-groove-r">
      <div className="px-4 pb-3 pt-4">
        <p className="text-small font-medium uppercase tracking-caps text-slate-50/80">Social</p>
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
      {support && (!q || "support".includes(q)) && (
        <button
          type="button"
          onClick={onSelectSupport}
          aria-current={supportActive ? "true" : undefined}
          className={`tap mx-3 mb-2 flex w-[calc(100%-1.5rem)] items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition ${
            supportActive ? "bg-neu-base shadow-pressed-low" : "hover:bg-neu-base/60"
          }`}
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neu-base text-signal-fg shadow-raised-low">
            <LifeBuoy className="h-5 w-5" strokeWidth={1.75} aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-body font-semibold text-slate-50">Support</span>
            <span className="block truncate text-small text-slate-500">{support.preview ?? "Message the Bass Note Piano team"}</span>
          </span>
          {support.unread > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-signal px-1.5 text-caption font-semibold text-slate-950">{support.unread}</span>
          )}
        </button>
      )}
      <PinnedGrid pinned={pinned} activeFriendId={activeFriendId} onSelect={onSelect} onTogglePin={onTogglePin} />
      <ConversationList conversations={rest} activeFriendId={activeFriendId} onSelect={onSelect} onTogglePin={onTogglePin} />
      {nothingFound && <p className="px-4 py-6 text-center text-small text-slate-500">Nothing matches that search.</p>}
      <GroupList groups={filteredGroups} activeGroupId={activeGroupId} onSelect={onSelectGroup} onNewGroup={onNewGroup} filtering={q !== ""} />
    </div>
  );
}
