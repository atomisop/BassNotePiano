"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import type { ConversationSummary } from "@/lib/messages";
import type { GroupSummary } from "@/lib/groupMessages";
import { playNotificationSound } from "@/lib/notification-sound";
import { ConversationSidebar } from "./components/ConversationSidebar";
import { ChatWindow } from "@/components/messaging/ChatWindow";
import { EmptyState } from "@/components/messaging/EmptyState";
import { GroupChatWindow } from "./components/GroupChatWindow";
import { NewGroupPanel } from "./components/NewGroupPanel";
import {
  getConversationsAction,
  getConversationMessagesAction,
  sendMessageAction,
  markConversationReadAction,
  togglePinAction,
  setTypingAction,
  reactToMessageAction,
  getGroupsAction,
  getGroupMessagesAction,
  sendGroupMessageAction,
  markGroupReadAction,
  createGroupAction,
  leaveGroupAction,
  reactToGroupMessageAction,
  type MessageRow,
  type GroupMessageRow,
} from "./actions";

const CONVERSATION_LIST_POLL_MS = 15_000;
const ACTIVE_CONVERSATION_POLL_MS = 2_500;

function MessagesInner({
  initialConversations,
  initialGroups,
}: {
  initialConversations: ConversationSummary[];
  initialGroups: GroupSummary[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const activeFriendId = searchParams.get("with");
  const activeGroupId = searchParams.get("group");

  const [conversations, setConversations] = useState(initialConversations);
  const [groups, setGroups] = useState(initialGroups);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [groupMessages, setGroupMessages] = useState<GroupMessageRow[]>([]);
  const [newGroupOpen, setNewGroupOpen] = useState(false);

  // activeChatId is a real, intentional null state (no auto-selecting the
  // first conversation) — that's what makes the empty state and the mobile
  // sidebar/chat split meaningful.
  const active = conversations.find((c) => c.friendId === activeFriendId) ?? null;
  const activeGroup = groups.find((g) => g.id === activeGroupId) ?? null;
  const hasActivePane = Boolean(activeFriendId || activeGroupId);
  // Captured as their own primitives so the two polling effects below can
  // depend on (and reference) only these, never `active`/`activeGroup`
  // themselves — both are recomputed fresh every render, so depending on
  // the objects would poll on every unrelated re-render instead of only
  // when the active chat/group actually changes.
  const activeConversationId = active?.friendId ?? null;
  const activeGroupPollId = activeGroup?.id ?? null;

  useEffect(() => {
    const interval = setInterval(async () => {
      setConversations(await getConversationsAction());
      setGroups(await getGroupsAction());
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
      const rows = await getConversationMessagesAction(friendId);
      if (cancelled) return;

      const newest = rows[rows.length - 1];
      if (previousLastMessageId !== null && newest && newest.id !== previousLastMessageId && newest.senderId === friendId) {
        playNotificationSound();
      }
      previousLastMessageId = newest?.id ?? previousLastMessageId;

      setMessages(rows);
      await markConversationReadAction(friendId);
      setConversations(await getConversationsAction());
    }
    load();

    const interval = setInterval(load, ACTIVE_CONVERSATION_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [activeConversationId]);

  useEffect(() => {
    if (!activeGroupPollId) {
      setGroupMessages([]);
      return;
    }

    // Same reasoning as the conversation effect above: recaptured so `load`
    // gets a definitely-string local instead of the nullable outer one.
    const groupId = activeGroupPollId;
    let cancelled = false;
    let previousLastMessageId: string | null = null;

    async function load() {
      const rows = await getGroupMessagesAction(groupId);
      if (cancelled) return;

      const newest = rows[rows.length - 1];
      if (previousLastMessageId !== null && newest && newest.id !== previousLastMessageId && newest.senderId !== session?.user?.id) {
        playNotificationSound();
      }
      previousLastMessageId = newest?.id ?? previousLastMessageId;

      setGroupMessages(rows);
      await markGroupReadAction(groupId);
      setGroups(await getGroupsAction());
    }
    load();

    const interval = setInterval(load, ACTIVE_CONVERSATION_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [activeGroupPollId, session?.user?.id]);

  function handleSelect(friendId: string) {
    router.push(`/messages?with=${friendId}`);
  }

  function handleSelectGroup(groupId: string) {
    router.push(`/messages?group=${groupId}`);
  }

  function handleMinimize() {
    router.push("/messages");
  }

  async function handleSend(body: string, replyToId?: string): Promise<boolean> {
    if (!active) return false;
    const result = await sendMessageAction(active.friendId, body, replyToId);
    if (result.ok) {
      setMessages(await getConversationMessagesAction(active.friendId));
      setConversations(await getConversationsAction());
    }
    return result.ok;
  }

  async function handleSendGroup(body: string, replyToId?: string): Promise<boolean> {
    if (!activeGroup) return false;
    const result = await sendGroupMessageAction(activeGroup.id, body, replyToId);
    if (result.ok) {
      setGroupMessages(await getGroupMessagesAction(activeGroup.id));
      setGroups(await getGroupsAction());
    }
    return result.ok;
  }

  async function handleReact(messageId: string, emoji: string) {
    if (!active) return;
    await reactToMessageAction(messageId, emoji);
    setMessages(await getConversationMessagesAction(active.friendId));
  }

  async function handleReactGroup(messageId: string, emoji: string) {
    if (!activeGroup) return;
    await reactToGroupMessageAction(messageId, emoji);
    setGroupMessages(await getGroupMessagesAction(activeGroup.id));
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

  async function handleCreateGroup(name: string, memberUsernames: string[]) {
    const result = await createGroupAction(name, memberUsernames);
    if (!result.ok) return result;
    setGroups(await getGroupsAction());
    setNewGroupOpen(false);
    router.push(`/messages?group=${result.groupId}`);
    return { ok: true as const };
  }

  async function handleLeaveGroup() {
    if (!activeGroup) return;
    await leaveGroupAction(activeGroup.id);
    setGroups(await getGroupsAction());
    router.push("/messages");
  }

  if (conversations.length === 0 && groups.length === 0) {
    return (
      <div className="mx-auto max-w-xl">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50)/0.8)]">Social</p>
        <h1 className="mt-1.5 font-serif text-2xl text-slate-50">Messages</h1>
        <p className="mt-4 text-sm text-slate-500">
          You don&apos;t have any friends to message yet. Add some on the{" "}
          <a href="/friends" className="underline underline-offset-2 text-[rgb(var(--c-s-50))] hover:opacity-70">
            Friends
          </a>{" "}
          page first.
        </p>
      </div>
    );
  }

  return (
    // 100dvh, not 100vh: unlike the app shell (which deliberately stays put
    // through Safari's toolbar auto-hide, see (dashboard)/layout.tsx's own
    // comment on that choice), this pane *should* shrink when the on-screen
    // keyboard opens for the message input below. 100vh is measured against
    // the large viewport and never accounts for the keyboard at all, so
    // this box stayed its full height with the keyboard covering the
    // bottom of it, and the only way anything could bring the now-hidden
    // input back into view was scrolling the whole pane up, taking the
    // header (the person you're actually talking to) off the top of the
    // screen with it. 100dvh tracks the real visible viewport continuously,
    // keyboard included, so the header and input (both fixed-size flex
    // children, see ChatWindow's own h-full flex-col) stay pinned in place
    // and only the message list in between actually shrinks.
    <div className="glass-surface flex h-[calc(100dvh-9rem)] overflow-hidden">
      <div className={`${hasActivePane ? "hidden md:flex" : "flex"} md:w-[350px] md:shrink-0`}>
        <ConversationSidebar
          conversations={conversations}
          groups={groups}
          activeFriendId={activeFriendId}
          activeGroupId={activeGroupId}
          onSelect={handleSelect}
          onTogglePin={handleTogglePin}
          onSelectGroup={handleSelectGroup}
          onNewGroup={() => setNewGroupOpen(true)}
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
            onTyping={(friendId) => void setTypingAction(friendId)}
            onReact={handleReact}
          />
        ) : activeGroup ? (
          <GroupChatWindow
            key={activeGroup.id}
            group={activeGroup}
            currentUserId={session?.user?.id ?? ""}
            messages={groupMessages}
            onSend={handleSendGroup}
            onMinimize={handleMinimize}
            onLeave={handleLeaveGroup}
            onReact={handleReactGroup}
          />
        ) : (
          <EmptyState />
        )}
      </div>

      <NewGroupPanel open={newGroupOpen} onClose={() => setNewGroupOpen(false)} onCreate={handleCreateGroup} />
    </div>
  );
}

export function MessagesClient({
  initialConversations,
  initialGroups,
}: {
  initialConversations: ConversationSummary[];
  initialGroups: GroupSummary[];
}) {
  return (
    <Suspense fallback={null}>
      <MessagesInner initialConversations={initialConversations} initialGroups={initialGroups} />
    </Suspense>
  );
}
