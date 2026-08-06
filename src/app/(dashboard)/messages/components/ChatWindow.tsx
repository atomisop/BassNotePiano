"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import type { ConversationSummary } from "@/lib/messages";
import { Avatar } from "./Avatar";
import { TypingIndicator } from "./TypingIndicator";
import { setTypingAction, type MessageRow } from "../actions";

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

// Throttled, not debounced — pings the server at most once per window while
// the user keeps typing, instead of waiting for a pause. TypingStatus rows
// go stale on their own (see TYPING_STALE_MS in src/lib/messages.ts), so
// there's no matching "stopped typing" call to send.
const TYPING_PING_THROTTLE_MS = 1_500;

export function ChatWindow({
  conversation,
  messages,
  onSend,
  onMinimize,
}: {
  conversation: ConversationSummary;
  messages: MessageRow[];
  onSend: (body: string) => Promise<boolean>;
  onMinimize: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastTypingPingRef = useRef(0);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  function handleDraftChange(value: string) {
    setDraft(value);
    const now = Date.now();
    if (now - lastTypingPingRef.current > TYPING_PING_THROTTLE_MS) {
      lastTypingPingRef.current = now;
      void setTypingAction(conversation.friendId);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    setSending(true);
    const body = draft;
    setDraft("");
    const ok = await onSend(body);
    setSending(false);
    if (!ok) setDraft(body);
  }

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <div className="flex items-center gap-2.5 border-b border-white/10 p-4">
        <Avatar image={conversation.friendImage} label={conversation.friendName ?? conversation.friendUsername ?? "?"} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-slate-100">{conversation.friendName ?? "Unnamed"}</p>
          {conversation.isTyping ? (
            <p className="flex items-center gap-1.5 text-xs text-amber-300">
              typing <TypingIndicator />
            </p>
          ) : (
            conversation.friendUsername && <p className="truncate text-xs text-slate-500">@{conversation.friendUsername}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onMinimize}
          aria-label="Minimize chat"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 text-slate-400 transition hover:border-white/20 hover:bg-white/5 hover:text-slate-200"
        >
          <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div className="min-w-0 flex-1 space-y-2 overflow-y-auto p-4">
        {messages.map((m) => {
          const isMine = m.senderId !== conversation.friendId;
          return (
            <div key={m.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: "spring", stiffness: 250, damping: 25 }}
                className={`max-w-[70%] rounded-2xl px-3.5 py-2 text-sm ${
                  isMine ? "bg-amber-400 text-slate-950" : "border border-white/10 bg-slate-950 text-slate-100"
                }`}
              >
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
                <p className={`mt-1 text-[10px] ${isMine ? "text-slate-950/60" : "text-slate-600"}`}>{relativeTime(m.createdAt)}</p>
              </motion.div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="flex min-w-0 gap-2 border-t border-white/10 p-3">
        <input
          type="text"
          value={draft}
          onChange={(e) => handleDraftChange(e.target.value)}
          placeholder="Write a message…"
          maxLength={2000}
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-amber-400/60"
        />
        <button
          type="submit"
          disabled={sending || !draft.trim()}
          className="cta-sheen rounded-lg bg-amber-400 px-4 py-2 text-xs font-semibold text-slate-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Send
        </button>
      </form>
    </div>
  );
}
