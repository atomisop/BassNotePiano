"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import type { ConversationSummary } from "@/lib/messages";
import { playNotificationSound } from "@/lib/notification-sound";
import { ConversationSidebar } from "./components/ConversationSidebar";
import { ChatWindow } from "./components/ChatWindow";
import { EmptyState } from "./components/EmptyState";
import {
  getConversationsAction,
  getConversationMessagesAction,
  sendMessageAction,
  markConversationReadAction,
  togglePinAction,
  type MessageRow,
} from "./actions";

const CONVERSATION_LIST_POLL_MS = 15_000;
const ACTIVE_CONVERSATION_POLL_MS = 2_500;

function MessagesInner({ initialConversations }: { initialConversations: ConversationSummary[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeFriendId = searchParams.get("with");

  const [conversations, setConversations] = useState(initialConversations);
  const [messages, setMessages] = useState<MessageRow[]>([]);

  // activeChatId is a real, intentional null state (no auto-selecting the
  // first conversation) — that's what makes the empty state and the mobile
  // sidebar/chat split meaningful.
  const active = conversations.find((c) => c.friendId === activeFriendId) ?? null;

  useEffect(() => {
    const interval = setInterval(async () => {
      setConversations(await getConversationsAction());
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
      const rows = await getConversationMessagesAction(active!.friendId);
      if (cancelled) return;

      const newest = rows[rows.length - 1];
      if (previousLastMessageId !== null && newest && newest.id !== previousLastMessageId && newest.senderId === active!.friendId) {
        playNotificationSound();
      }
      previousLastMessageId = newest?.id ?? previousLastMessageId;

      setMessages(rows);
      await markConversationReadAction(active!.friendId);
      setConversations(await getConversationsAction());
    }
    load();

    const interval = setInterval(load, ACTIVE_CONVERSATION_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [active?.friendId]);

  function handleSelect(friendId: string) {
    router.push(`/messages?with=${friendId}`);
  }

  function handleMinimize() {
    router.push("/messages");
  }

  async function handleSend(body: string): Promise<boolean> {
    if (!active) return false;
    const result = await sendMessageAction(active.friendId, body);
    if (result.ok) {
      setMessages(await getConversationMessagesAction(active.friendId));
      setConversations(await getConversationsAction());
    }
    return result.ok;
  }

  async function handleTogglePin(friendId: string) {
    // Optimistic: flip isPinned immediately, then reconcile with the
    // server's actual pinOrder on the next poll or the action's response.
    setConversations((prev) =>
      prev.map((c) => (c.friendId === friendId ? { ...c, isPinned: !c.isPinned } : c)),
    );
    const result = await togglePinAction(friendId);
    if (!result.ok) {
      // Roll back — the toggle failed server-side.
      setConversations((prev) =>
        prev.map((c) => (c.friendId === friendId ? { ...c, isPinned: !c.isPinned } : c)),
      );
      return;
    }
    setConversations(await getConversationsAction());
  }

  if (conversations.length === 0) {
    return (
      <div className="mx-auto max-w-xl">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-400/80">Social</p>
        <h1 className="mt-1.5 font-serif text-2xl text-slate-50">Messages</h1>
        <p className="mt-4 text-sm text-slate-500">
          You don't have any friends to message yet. Add some on the{" "}
          <a href="/friends" className="text-amber-300 hover:text-amber-200">
            Friends
          </a>{" "}
          page first.
        </p>
      </div>
    );
  }

  return (
    <div className="glass-card flex h-[calc(100vh-9rem)] overflow-hidden">
      <div className={`${activeFriendId ? "hidden md:flex" : "flex"} md:w-[350px] md:shrink-0`}>
        <ConversationSidebar
          conversations={conversations}
          activeFriendId={activeFriendId}
          onSelect={handleSelect}
          onTogglePin={handleTogglePin}
        />
      </div>

      <div className={`${activeFriendId ? "flex" : "hidden md:flex"} min-w-0 flex-1`}>
        {active ? (
          <ChatWindow key={active.friendId} conversation={active} messages={messages} onSend={handleSend} onMinimize={handleMinimize} />
        ) : (
          <EmptyState />
        )}
      </div>
    </div>
  );
}

export function MessagesClient({ initialConversations }: { initialConversations: ConversationSummary[] }) {
  return (
    <Suspense fallback={null}>
      <MessagesInner initialConversations={initialConversations} />
    </Suspense>
  );
}
