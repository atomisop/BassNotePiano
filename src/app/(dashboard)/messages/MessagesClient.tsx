"use client";

import { Suspense, useEffect, useRef, useState, type FormEvent } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import type { ConversationSummary } from "@/lib/messages";
import { playNotificationSound } from "@/lib/notification-sound";
import {
  getConversationsAction,
  getConversationMessagesAction,
  sendMessageAction,
  markConversationReadAction,
  type MessageRow,
} from "./actions";

const CONVERSATION_LIST_POLL_MS = 15_000;
const ACTIVE_CONVERSATION_POLL_MS = 2_500;

function Avatar({ image, label }: { image: string | null; label: string }) {
  return (
    <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full border border-white/10 bg-slate-800">
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-xs text-slate-500">{label.charAt(0).toUpperCase()}</div>
      )}
    </div>
  );
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function MessagesInner({ initialConversations }: { initialConversations: ConversationSummary[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeFriendId = searchParams.get("with");

  const [conversations, setConversations] = useState(initialConversations);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const active = conversations.find((c) => c.friendId === activeFriendId) ?? conversations[0] ?? null;

  useEffect(() => {
    if (!activeFriendId && conversations[0]) {
      router.replace(`/messages?with=${conversations[0].friendId}`);
    }
  }, [activeFriendId, conversations, router]);

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
    }
    load();

    const interval = setInterval(load, ACTIVE_CONVERSATION_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [active?.friendId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    if (!active || !draft.trim()) return;
    setSending(true);
    const body = draft;
    setDraft("");
    const result = await sendMessageAction(active.friendId, body);
    setSending(false);
    if (result.ok) {
      setMessages(await getConversationMessagesAction(active.friendId));
      setConversations(await getConversationsAction());
    } else {
      setDraft(body);
    }
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
    <div className="mx-auto flex h-[calc(100vh-6.25rem)] max-w-4xl gap-4">
      <div className="w-64 shrink-0 overflow-y-auto glass-card p-2">
        {conversations.map((c) => (
          <button
            key={c.friendId}
            type="button"
            onClick={() => router.push(`/messages?with=${c.friendId}`)}
            className={`flex w-full items-center gap-2.5 rounded-lg p-2.5 text-left transition ${
              active?.friendId === c.friendId ? "bg-amber-400/10" : "hover:bg-white/5"
            }`}
          >
            <Avatar image={c.friendImage} label={c.friendName ?? c.friendUsername ?? "?"} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm text-slate-100">{c.friendName ?? `@${c.friendUsername}`}</p>
                {c.unreadCount > 0 && (
                  <span className="flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-amber-400 px-1 text-[10px] font-bold text-slate-950">
                    {c.unreadCount > 9 ? "9+" : c.unreadCount}
                  </span>
                )}
              </div>
              {c.lastMessageBody && <p className="truncate text-xs text-slate-500">{c.lastMessageBody}</p>}
            </div>
          </button>
        ))}
      </div>

      <div className="flex flex-1 flex-col glass-card">
        {active && (
          <>
            <div className="flex items-center gap-2.5 border-b border-white/10 p-4">
              <Avatar image={active.friendImage} label={active.friendName ?? active.friendUsername ?? "?"} />
              <div>
                <p className="text-sm text-slate-100">{active.friendName ?? "Unnamed"}</p>
                {active.friendUsername && <p className="text-xs text-slate-500">@{active.friendUsername}</p>}
              </div>
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto p-4">
              {messages.map((m) => {
                const isMine = m.senderId !== active.friendId;
                return (
                  <div key={m.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[70%] rounded-2xl px-3.5 py-2 text-sm ${
                        isMine ? "bg-amber-400 text-slate-950" : "border border-white/10 bg-slate-950 text-slate-100"
                      }`}
                    >
                      <p className="whitespace-pre-wrap break-words">{m.body}</p>
                      <p className={`mt-1 text-[10px] ${isMine ? "text-slate-950/60" : "text-slate-600"}`}>{relativeTime(m.createdAt)}</p>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            <form onSubmit={handleSend} className="flex gap-2 border-t border-white/10 p-3">
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Write a message…"
                maxLength={2000}
                className="flex-1 rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-amber-400/60"
              />
              <button
                type="submit"
                disabled={sending || !draft.trim()}
                className="rounded-lg bg-amber-400 px-4 py-2 text-xs font-semibold text-slate-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Send
              </button>
            </form>
          </>
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
