"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import type { GroupSummary } from "@/lib/groupMessages";
import { Avatar } from "@/components/messaging/Avatar";
import { GroupAvatar } from "./GroupAvatar";
import type { GroupMessageRow } from "../actions";

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function groupTitle(group: GroupSummary): string {
  if (group.name) return group.name;
  if (group.memberNames.length === 0) return "Group";
  return group.memberNames.join(", ");
}

export function GroupChatWindow({
  group,
  currentUserId,
  messages,
  onSend,
  onMinimize,
  onLeave,
}: {
  group: GroupSummary;
  currentUserId: string;
  messages: GroupMessageRow[];
  onSend: (body: string) => Promise<boolean>;
  onMinimize: () => void;
  onLeave: () => Promise<void>;
}) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

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

  async function handleLeave() {
    setLeaving(true);
    await onLeave();
    setLeaving(false);
  }

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <div className="flex items-center gap-2.5 border-b border-ink/10 p-4">
        <GroupAvatar />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-slate-100">{groupTitle(group)}</p>
          <p className="truncate text-xs text-slate-500">
            {group.memberCount} member{group.memberCount === 1 ? "" : "s"}
          </p>
        </div>
        {confirmingLeave ? (
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => setConfirmingLeave(false)}
              disabled={leaving}
              className="rounded-lg border border-ink/10 px-2.5 py-1.5 text-xs text-slate-300 transition hover:bg-slate-800 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleLeave}
              disabled={leaving}
              className="rounded-lg bg-red-500/95 px-2.5 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-red-500 disabled:opacity-50"
            >
              {leaving ? "Leaving…" : "Leave group"}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingLeave(true)}
            className="shrink-0 rounded-lg border border-ink/10 px-2.5 py-1.5 text-xs text-slate-400 transition hover:border-red-400/30 hover:text-red-300"
          >
            Leave
          </button>
        )}
        <button
          type="button"
          onClick={onMinimize}
          aria-label="Minimize chat"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-ink/10 text-slate-400 transition hover:border-ink/15 hover:bg-ink/5 hover:text-slate-200"
        >
          <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div className="min-w-0 flex-1 space-y-2.5 overflow-y-auto p-4">
        {messages.map((m) => {
          const isMine = m.senderId === currentUserId;
          return (
            <div key={m.id} className={`flex items-end gap-2 ${isMine ? "justify-end" : "justify-start"}`}>
              {!isMine && <Avatar image={m.senderImage} label={m.senderName ?? m.senderUsername ?? "?"} className="h-6 w-6 text-[10px]" />}
              <div className={`max-w-[70%] ${isMine ? "" : "min-w-0"}`}>
                {!isMine && <p className="mb-0.5 truncate px-1 text-[11px] text-slate-500">{m.senderName ?? `@${m.senderUsername}`}</p>}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ type: "spring", bounce: 0, duration: 0.4 }}
                  className={`rounded-2xl px-3.5 py-2 text-sm ${
                    isMine ? "bg-[rgb(var(--c-a-400))] text-slate-950" : "border border-ink/10 bg-slate-950 text-slate-100"
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  <p className={`mt-1 text-[10px] ${isMine ? "text-slate-950/60" : "text-slate-600"}`}>{relativeTime(m.createdAt)}</p>
                </motion.div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="flex min-w-0 gap-2 border-t border-ink/10 p-3">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Write a message…"
          maxLength={2000}
          className="min-w-0 flex-1 glass-surface-subtle px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-[rgb(var(--c-a-400)/0.6)]"
        />
        <button
          type="submit"
          disabled={sending || !draft.trim()}
          className="cta-sheen cta-fill rounded-lg px-4 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-60"
        >
          Send
        </button>
      </form>
    </div>
  );
}
