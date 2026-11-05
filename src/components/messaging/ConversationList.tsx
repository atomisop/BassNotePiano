"use client";

import { motion } from "framer-motion";
import type { ConversationSummary } from "@/lib/messages";
import { ConversationListItem } from "./ConversationListItem";

export function ConversationList({
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
  if (conversations.length === 0) {
    return null;
  }

  return (
    <div className="space-y-1 p-2">
      {conversations.map((c) => (
        <motion.div key={c.friendId} layout layoutId={`conv-${c.friendId}`}>
          <ConversationListItem
            conversation={c}
            active={activeFriendId === c.friendId}
            onSelect={() => onSelect(c.friendId)}
            onTogglePin={() => onTogglePin(c.friendId)}
          />
        </motion.div>
      ))}
    </div>
  );
}
