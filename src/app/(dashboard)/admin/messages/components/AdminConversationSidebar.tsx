"use client";

import type { ConversationSummary } from "@/lib/messages";
import { PinnedGrid } from "@/components/messaging/PinnedGrid";
import { ConversationList } from "@/components/messaging/ConversationList";

// Mirrors the student-facing ConversationSidebar's layout (pinned grid +
// list, same shared components) minus the group-chat section — admin
// messaging is 1:1 only — plus a "New message" button in its place, since
// the admin's counterpart to "pick a friend" is "search any user."
export function AdminConversationSidebar({
  conversations,
  activeUserId,
  onSelect,
  onTogglePin,
  onNewMessage,
}: {
  conversations: ConversationSummary[];
  activeUserId: string | null;
  onSelect: (userId: string) => void;
  onTogglePin: (userId: string) => void;
  onNewMessage: () => void;
}) {
  const pinned = conversations.filter((c) => c.isPinned).sort((a, b) => (a.pinOrder ?? 0) - (b.pinOrder ?? 0));
  const rest = conversations.filter((c) => !c.isPinned);

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto md:w-[350px] md:shrink-0 md:border-r md:border-ink/10">
      <div className="flex items-center justify-between border-b border-ink/10 px-4 py-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50)/0.8)]">Admin</p>
          <h1 className="mt-1 font-serif text-xl text-slate-50">Messages</h1>
        </div>
        <button
          type="button"
          onClick={onNewMessage}
          aria-label="New message"
          className="cta-sheen cta-fill flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
        >
          <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <PinnedGrid pinned={pinned} activeFriendId={activeUserId} onSelect={onSelect} onTogglePin={onTogglePin} />
      <ConversationList conversations={rest} activeFriendId={activeUserId} onSelect={onSelect} onTogglePin={onTogglePin} />
    </div>
  );
}
