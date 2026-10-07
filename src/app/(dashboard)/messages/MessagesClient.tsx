"use client";

import { Suspense, useEffect, useRef, useState } from "react";
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
  setGroupTypingAction,
  getGroupTypersAction,
  createGroupAction,
  leaveGroupAction,
  reactToGroupMessageAction,
  type MessageRow,
  type GroupMessageRow,
} from "./actions";
import { TwoPaneLayout, WideLayout } from "@/components/layout/PageLayouts";
import { RegionError } from "@/components/ui/RegionError";
import { usePoll } from "@/hooks/usePoll";

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
  const [groupTypers, setGroupTypers] = useState<string[]>([]);

  // activeChatId is a real, intentional null state (no auto-selecting the
  // first conversation), that's what makes the empty state and the mobile
  // sidebar/chat split meaningful.
  const active = conversations.find((c) => c.friendId === activeFriendId) ?? null;
  const activeGroup = groups.find((g) => g.id === activeGroupId) ?? null;
  const hasActivePane = Boolean(activeFriendId || activeGroupId);
  // Captured as their own primitives so the two polling effects below can
  // depend on (and reference) only these, never `active`/`activeGroup`
  // themselves, both are recomputed fresh every render, so depending on
  // the objects would poll on every unrelated re-render instead of only
  // when the active chat/group actually changes.
  const activeConversationId = active?.friendId ?? null;
  const activeGroupPollId = activeGroup?.id ?? null;

  const listPoll = usePoll(async (signal) => {
    const nextConversations = await getConversationsAction();
    const nextGroups = await getGroupsAction();
    if (signal.aborted) return;
    setConversations(nextConversations);
    setGroups(nextGroups);
  }, CONVERSATION_LIST_POLL_MS);

  // null = haven't loaded this conversation yet, so don't chime on first load.
  const previousConversationLastId = useRef<string | null>(null);
  const previousGroupLastId = useRef<string | null>(null);

  useEffect(() => {
    previousConversationLastId.current = null;
    if (!activeConversationId) setMessages([]);
  }, [activeConversationId]);

  useEffect(() => {
    previousGroupLastId.current = null;
    setGroupTypers([]);
    if (!activeGroupPollId) setGroupMessages([]);
  }, [activeGroupPollId]);

  const conversationPoll = usePoll(
    async (signal) => {
      // Captured per tick: the next tick may belong to a different chat, and
      // `signal` is aborted the moment the selection changes.
      const friendId = activeConversationId;
      if (!friendId) return;
      const rows = await getConversationMessagesAction(friendId);
      if (signal.aborted) return;

      const newest = rows[rows.length - 1];
      const previous = previousConversationLastId.current;
      if (previous !== null && newest && newest.id !== previous && newest.senderId === friendId) {
        playNotificationSound();
      }
      previousConversationLastId.current = newest?.id ?? previous;

      setMessages(rows);
      // Seen means the chat is open AND on screen. A background tab keeps
      // polling but must not tell the sender "Seen" (see visibility effect below).
      if (document.visibilityState === "visible") await markConversationReadAction(friendId);
      const nextConversations = await getConversationsAction();
      if (signal.aborted) return;
      setConversations(nextConversations);
    },
    ACTIVE_CONVERSATION_POLL_MS,
    { enabled: Boolean(activeConversationId), resetKey: activeConversationId },
  );

  const groupPoll = usePoll(
    async (signal) => {
      const groupId = activeGroupPollId;
      if (!groupId) return;
      const [rows, typers] = await Promise.all([getGroupMessagesAction(groupId), getGroupTypersAction(groupId)]);
      if (signal.aborted) return;
      setGroupTypers(typers);

      const newest = rows[rows.length - 1];
      const previous = previousGroupLastId.current;
      if (previous !== null && newest && newest.id !== previous && newest.senderId !== session?.user?.id) {
        playNotificationSound();
      }
      previousGroupLastId.current = newest?.id ?? previous;

      setGroupMessages(rows);
      if (document.visibilityState === "visible") await markGroupReadAction(groupId);
      const nextGroups = await getGroupsAction();
      if (signal.aborted) return;
      setGroups(nextGroups);
    },
    ACTIVE_CONVERSATION_POLL_MS,
    { enabled: Boolean(activeGroupPollId), resetKey: activeGroupPollId },
  );

  const pollFailed = listPoll.failed || conversationPoll.failed || groupPoll.failed;
  // Coming back to the tab with a chat open is the moment those messages are
  // actually seen, so run a tick right away instead of waiting out the interval.
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState !== "visible") return;
      conversationPoll.retry();
      groupPoll.retry();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConversationId, activeGroupPollId]);

  function retryPolls() {
    listPoll.retry();
    conversationPoll.retry();
    groupPoll.retry();
  }

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
      // Roll back, the toggle failed server-side.
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
      <WideLayout>
        <p className="text-small font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50)/0.8)]">Social</p>
        <h1 className="font-hero text-hero font-bold text-balance mt-1.5 text-slate-50">Messages</h1>
        <p className="mt-4 text-small text-slate-500">
          No conversations yet.
        </p>
      </WideLayout>
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
    //
    // The 12.5rem (13.5rem from md:) is the shell's real chrome: 4rem TopBar,
    // the <main> top padding, and its pb-28 that clears the floating dock.
    // It was 9rem, which only fit because chat auto-scroll used to shove the
    // whole shell upward to compensate; that is fixed, so the pane must fit.
    <>
      <TwoPaneLayout
        className="glass-surface h-[calc(100dvh-12.5rem)] overflow-hidden md:h-[calc(100dvh-13.5rem)]"
        showDetail={hasActivePane}
        list={
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
        }
        detail={
          active ? (
            <ChatWindow
              key={active.friendId}
              conversation={active}
              messages={messages}
              currentUserId={session?.user?.id ?? ""}
              onSend={handleSend}
              onMinimize={handleMinimize}
              onTyping={(friendId, typing) => void setTypingAction(friendId, typing)}
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
              typingNames={groupTypers}
              onTyping={(groupId, typing) => void setGroupTypingAction(groupId, typing)}
            />
          ) : (
            <EmptyState />
          )
        }
      />

      {/* Floats over the dock gap instead of sitting in the flow, so the
          chat pane (a fixed-height box) never jumps when it appears. */}
      {pollFailed && (
        <div className="pointer-events-none fixed inset-x-0 bottom-28 z-30 flex justify-center px-4">
          <RegionError
            className="pointer-events-auto w-full max-w-md shadow-raised-mid"
            title="Messages stopped updating."
            detail="Check your connection. New messages will appear once it's back."
            onRetry={retryPolls}
          />
        </div>
      )}

      <NewGroupPanel open={newGroupOpen} onClose={() => setNewGroupOpen(false)} onCreate={handleCreateGroup} />
    </>
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
