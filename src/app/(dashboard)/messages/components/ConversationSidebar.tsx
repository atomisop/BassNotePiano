"use client";

import type { ConversationSummary } from "@/lib/messages";
import { PinnedGrid } from "./PinnedGrid";
import { ConversationList } from "./ConversationList";

export function ConversationSidebar({
  conversations,
  activeFriendId,
  onSelect,
  onTogglePin,
}: {
  conversations: ConversationSummary[];
  activeFriendId: string | null;
  onSelect: (friendId: string) => void;
  onTogglePin: (friendId: string) => void;
}) {
  const pinned = conversations.filter((c) => c.isPinned).sort((a, b) => (a.pinOrder ?? 0) - (b.pinOrder ?? 0));
  const rest = conversations.filter((c) => !c.isPinned);

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto md:w-[350px] md:shrink-0 md:border-r md:border-white/10">
      <div className="border-b border-white/10 px-4 py-4">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-400/80">Social</p>
        <h1 className="mt-1 font-serif text-xl text-slate-50">Messages</h1>
      </div>
      <PinnedGrid pinned={pinned} activeFriendId={activeFriendId} onSelect={onSelect} onTogglePin={onTogglePin} />
      <ConversationList conversations={rest} activeFriendId={activeFriendId} onSelect={onSelect} onTogglePin={onTogglePin} />
    </div>
  );
}
