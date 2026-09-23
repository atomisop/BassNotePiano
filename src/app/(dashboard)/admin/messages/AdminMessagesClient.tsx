"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
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
  reactToAdminMessageAction,
  type MessageRow,
} from "./actions";

const CONVERSATION_LIST_POLL_MS = 15_000;
const ACTIVE_CONVERSATION_POLL_MS = 2_500;

function AdminMessagesInner({ initialConversations }: { initialConversations: ConversationSummary[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
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
  // Captured as its own primitive so the polling effect below can depend on
  // (and reference) only this, never `active` itself — `merged`/`active` are
  // recomputed fresh every render, so depending on the object would poll on
  // every unrelated re-render instead of only when the active chat changes.
  const activeConversationId = active?.friendId ?? null;

  useEffect(() => {
    const interval = setInterval(async () => {
      setConversations(await getAdminConversationsAction());
    }, CONVERSATION_LIST_POLL_MS);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!activeConversationId) {
      setMessages([]);
      return;
    }

    // TS narrowing from the guard above doesn't cross into `load`, a
    // separately-declared nested function — recapture as a definitely-string
    // local so the action calls below don't need a `!` on every use.
    const friendId = activeConversationId;
    let cancelled = false;
    let previousLastMessageId: string | null = null; // null = haven't loaded yet, don't chime on first load

    async function load() {
      const rows = await getAdminConversationMessagesAction(friendId);
      if (cancelled) return;

      const newest = rows[rows.length - 1];
      if (previousLastMessageId !== null && newest && newest.id !== previousLastMessageId && newest.senderId === friendId) {
        playNotificationSound();
      }
      previousLastMessageId = newest?.id ?? previousLastMessageId;

      setMessages(rows);
      await markAdminConversationReadAction(friendId);
      setConversations(await getAdminConversationsAction());
    }
    load();

    const interval = setInterval(load, ACTIVE_CONVERSATION_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [activeConversationId]);

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

  async function handleSend(body: string, replyToId?: string): Promise<boolean> {
    if (!active) return false;
    const result = await sendAdminMessageAction(active.friendId, body, replyToId);
    if (result.ok) {
      setMessages(await getAdminConversationMessagesAction(active.friendId));
      setConversations(await getAdminConversationsAction());
    }
    return result.ok;
  }

  async function handleReact(messageId: string, emoji: string) {
    if (!active) return;
    await reactToAdminMessageAction(messageId, emoji);
    setMessages(await getAdminConversationMessagesAction(active.friendId));
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
    // 100dvh, not 100vh: same fix as the student-facing MessagesClient.tsx,
    // for the same reason, this pane should shrink for the on-screen
    // keyboard so the header stays visible instead of scrolling off with
    // the rest of the pane while typing a reply.
    <div className="glass-surface flex h-[calc(100dvh-9rem)] overflow-hidden">
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
            currentUserId={session?.user?.id ?? ""}
            onSend={handleSend}
            onMinimize={handleMinimize}
            onTyping={(userId) => void setAdminTypingAction(userId)}
            onReact={handleReact}
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
