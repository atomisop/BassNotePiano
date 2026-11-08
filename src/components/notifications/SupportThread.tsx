"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { ComposerBar } from "@/components/messaging/threadUi";
import { usePoll } from "@/hooks/usePoll";
import { announceChange } from "@/lib/liveEvents";
import type { SupportChat } from "@/lib/messagesSupport";
import { getSupportChatAction, markSupportChatReadAction, sendSupportChatMessageAction } from "@/app/(dashboard)/support/actions";
import { Hint } from "@/components/ui/Hint";

const POLL_MS = 3_000;

/**
 * The person's conversation with the Bass Note Piano team, inside the bell's Support tab. It is their own Support Chat thread (the one
 * Atom's handoff uses), so the team answers from Admin > Support Chat. While this tab is on screen it looks again every few seconds and
 * marks the team's replies read.
 */
export function SupportThread({ active }: { active: boolean }) {
  const [chat, setChat] = useState<SupportChat | null>(null);
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const count = chat?.messages.length ?? 0;

  usePoll(
    async (signal) => {
      const next = await getSupportChatAction();
      if (signal.aborted) return;
      if (document.visibilityState === "visible" && next.unread > 0) {
        await markSupportChatReadAction();
        announceChange("messages");
        next.unread = 0;
      }
      setChat(next);
    },
    POLL_MS,
    { enabled: active, resetKey: active ? "support" : null },
  );

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [count]);

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    const body = value.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    const result = await sendSupportChatMessageAction(body);
    if (result.ok) {
      setValue("");
      setChat(await getSupportChatAction());
    } else {
      setError(result.error);
    }
    setSending(false);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void submit();
    }
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-6 py-4">
        {chat && chat.messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-1 px-4 text-center">
            <p className="text-body font-semibold text-slate-200">Ask the studio anything</p>
            <p className="text-small text-slate-500"><Hint>Questions about classes, payments or your account. The team&apos;s replies show up here.</Hint></p>
          </div>
        )}
        {chat?.messages.map((m) => (
          <div key={m.id} className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-body ${
                m.mine ? "bg-signal/16 text-slate-50" : "bg-neu-base text-slate-100"
              }`}
            >
              {m.body}
              <span suppressHydrationWarning className="mt-1 block text-right text-small text-slate-400">
                {new Date(m.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
              </span>
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      {error && <p className="px-6 pb-1 text-small text-red-400">{error}</p>}
      <ComposerBar
        formRef={formRef}
        textareaRef={textareaRef}
        value={value}
        onChange={setValue}
        onKeyDown={onKeyDown}
        onSubmit={submit}
        sending={sending}
        maxHeight={120}
      />
    </div>
  );
}
