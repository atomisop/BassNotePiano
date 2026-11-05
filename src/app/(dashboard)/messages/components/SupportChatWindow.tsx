"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { LifeBuoy } from "@/components/ui/appIcons";
import { ThreadBackButton } from "@/components/messaging/threadUi";
import type { SupportChat } from "@/lib/messagesSupport";
import { ComposerBar } from "@/components/messaging/threadUi";

/** The person's conversation with the Bass Note Piano team, shown like any other chat in Messages. */
export function SupportChatWindow({
  chat,
  onSend,
  onMinimize,
}: {
  chat: SupportChat;
  onSend: (body: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  onMinimize: () => void;
}) {
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const count = chat.messages.length;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [count]);

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    const body = value.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    const result = await onSend(body);
    setSending(false);
    if (result.ok) setValue("");
    else setError(result.error);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void submit();
    }
  }

  return (
    <div className="flex h-full min-w-0 flex-col">
      <div className="flex items-center gap-3 neu-groove-b px-4 py-3">
        <ThreadBackButton onClick={onMinimize} />
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-neu-base text-signal-fg shadow-raised-low">
          <LifeBuoy className="h-4.5 w-4.5" strokeWidth={1.75} aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="truncate text-body font-semibold text-slate-50">Support</p>
          <p className="truncate text-small text-slate-500">Bass Note Piano team</p>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-4">
        {chat.messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-1 px-6 text-center">
            <p className="text-body font-semibold text-slate-200">Ask the studio anything</p>
            <p className="text-small text-slate-500">Questions about classes, payments or your account. The team&apos;s replies show up here.</p>
          </div>
        )}
        {chat.messages.map((m) => (
          <div key={m.id} className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-body ${
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

      {error && <p className="px-4 pb-1 text-small text-red-400">{error}</p>}
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
