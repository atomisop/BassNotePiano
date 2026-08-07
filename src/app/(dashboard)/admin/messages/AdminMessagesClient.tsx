"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import type { ConversationSummary, MessageableUser } from "@/lib/messages";
import { playNotificationSound } from "@/lib/notification-sound";
import { ChatWindow } from "@/components/messaging/ChatWindow";
import { EmptyState } from "@/components/messaging/EmptyState";
import { AdminConversationSidebar } from "./components/AdminConversationSidebar";
import { NewMessagePanel } from "./components/NewMessagePanel";
import {
  getAdminConversationsAction,
  getAdminConversationMessagesAction,
  sendAdminMessageAction,
  markAdminConversationReadAction,
  toggleAdminPinAction,
  setAdminTypingAction,
  type MessageRow,
} from "./actions";

const CONVERSATION_LIST_POLL_MS = 15_000;
const ACTIVE_CONVERSATION_POLL_MS = 2_500;

function AdminMessagesInner({ initialConversations }: { initialConversations: ConversationSummary[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeUserId = searchParams.get("with");

  const [conversations, setConversations] = useState(initialConversations);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [newMessageOpen, setNewMessageOpen] = useState(false);
  // A just-started conversation with no messages yet won't show up in a
  // polled getAdminConversationsAction() result (nothing derives it from —
  // there's no Message row until the first send), so it's tracked here
  // separately until either a real one appears for the same friendId (the
  // merge below prefers that) or the admin navigates elsewhere.
  const [draftPartner, setDraftPartner] = useState<ConversationSummary | null>(null);

  const merged =
    draftPartner && !conversations.some((c) => c.friendId === draftPartner.friendId)
      ? [draftPartner, ...conversations]
      : conversations;

  const active = merged.find((c) => c.friendId === activeUserId) ?? null;

  useEffect(() => {
    const interval = setInterval(async () => {
      setConversations(await getAdminConversationsAction());
    }, CONVERSATION_LIST_POLL_MS);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!active) {
      setMessages([]);
      return;
    }

    let cancelled = false;
    let previousLastMessageId: string | null = null; // null = haven't loaded yet, don't chime on first load

    async function load() {
      const rows = await getAdminConversationMessagesAction(active!.friendId);
      if (cancelled) return;

      const newest = rows[rows.length - 1];
      if (previousLastMessageId !== null && newest && newest.id !== previousLastMessageId && newest.senderId === active!.friendId) {
        playNotificationSound();
      }
      previousLastMessageId = newest?.id ?? previousLastMessageId;

      setMessages(rows);
      await markAdminConversationReadAction(active!.friendId);
      setConversations(await getAdminConversationsAction());
    }
    load();

    const interval = setInterval(load, ACTIVE_CONVERSATION_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [active?.friendId]);

  function handleSelect(userId: string) {
    router.push(`/admin/messages?with=${userId}`);
  }

  function handleMinimize() {
    router.push("/admin/messages");
  }

  function handleSelectNewUser(user: MessageableUser) {
    setDraftPartner({
      friendId: user.id,
      friendUsername: null,
      friendName: user.name ?? user.email,
      friendImage: user.image,
      lastMessageBody: null,
      lastMessageAt: null,
      unreadCount: 0,
      isPinned: false,
      pinOrder: null,
      isTyping: false,
    });
    router.push(`/admin/messages?with=${user.id}`);
  }

  async function handleSend(body: string): Promise<boolean> {
    if (!active) return false;
    const result = await sendAdminMessageAction(active.friendId, body);
    if (result.ok) {
      setMessages(await getAdminConversationMessagesAction(active.friendId));
      setConversations(await getAdminConversationsAction());
    }
    return result.ok;
  }

  async function handleTogglePin(userId: string) {
    setConversations((prev) => prev.map((c) => (c.friendId === userId ? { ...c, isPinned: !c.isPinned } : c)));
    const result = await toggleAdminPinAction(userId);
    if (!result.ok) {
      setConversations((prev) => prev.map((c) => (c.friendId === userId ? { ...c, isPinned: !c.isPinned } : c)));
      return;
    }
    setConversations(await getAdminConversationsAction());
  }

  const hasActivePane = Boolean(activeUserId);

  return (
    <div className="glass-surface flex h-[calc(100vh-9rem)] overflow-hidden">
      <div className={`${hasActivePane ? "hidden md:flex" : "flex"} md:w-[350px] md:shrink-0`}>
        <AdminConversationSidebar
          conversations={merged}
          activeUserId={activeUserId}
          onSelect={handleSelect}
          onTogglePin={handleTogglePin}
          onNewMessage={() => setNewMessageOpen(true)}
        />
      </div>

      <div className={`${hasActivePane ? "flex" : "hidden md:flex"} min-w-0 flex-1`}>
        {active ? (
          <ChatWindow
            key={active.friendId}
            conversation={active}
            messages={messages}
            onSend={handleSend}
            onMinimize={handleMinimize}
            onTyping={(userId) => void setAdminTypingAction(userId)}
          />
        ) : (
          <EmptyState />
        )}
      </div>

      <NewMessagePanel open={newMessageOpen} onClose={() => setNewMessageOpen(false)} onSelectUser={handleSelectNewUser} />
    </div>
  );
}

export function AdminMessagesClient({ initialConversations }: { initialConversations: ConversationSummary[] }) {
  return (
    <Suspense fallback={null}>
      <AdminMessagesInner initialConversations={initialConversations} />
    </Suspense>
  );
}
