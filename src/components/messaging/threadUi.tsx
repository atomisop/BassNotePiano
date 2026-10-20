"use client";

import type { FormEvent, KeyboardEvent, RefObject } from "react";
import { ArrowLeftIcon, XIcon } from "@/components/ui/icons";
import { SendButton } from "@/components/ui/send-button";

/** "3:42 PM". Bubbles show a clock time; the day lives in the divider above. */
export function clockLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/** Today, Yesterday, a weekday inside the last week, otherwise "Oct 2". */
export function dayLabel(iso: string): string {
  const d = new Date(iso);
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(new Date()) - startOf(d)) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return d.toLocaleDateString("en-US", { weekday: "long" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
}

/** Short stamp for a conversation list row: clock today, "Yesterday", weekday, or date. */
export function listStamp(date: Date | string | null): string | null {
  if (!date) return null;
  const iso = typeof date === "string" ? date : date.toISOString();
  const label = dayLabel(iso);
  if (label === "Today") return clockLabel(iso);
  if (label.length > 9 && label !== "Yesterday") return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return label === "Yesterday" ? label : label.slice(0, 3);
}

const CLUSTER_GAP_MS = 5 * 60_000;

export interface TimelineMeta {
  showDay: boolean;
  /** Last message of a run from one sender: gets the time stamp and the bubble tail. */
  endsCluster: boolean;
  /** First message of a run: gets extra space above it. */
  startsCluster: boolean;
}

/** Works out day dividers and sender runs so consecutive messages sit close together. */
export function layoutThread<T extends { senderId: string; createdAt: string }>(messages: T[]): TimelineMeta[] {
  const sameCluster = (a: T, b: T) =>
    a.senderId === b.senderId &&
    new Date(b.createdAt).toDateString() === new Date(a.createdAt).toDateString() &&
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() < CLUSTER_GAP_MS;
  return messages.map((m, i) => {
    const prev = messages[i - 1];
    const next = messages[i + 1];
    return {
      showDay: !prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString(),
      startsCluster: !prev || !sameCluster(prev, m),
      endsCluster: !next || !sameCluster(m, next),
    };
  });
}

export function DayDivider({ iso }: { iso: string }) {
  return (
    <div className="flex justify-center pb-1 pt-3">
      <span className="rounded-full bg-neu-base px-3 py-1 text-small font-medium text-slate-500 shadow-pressed-low">
        {dayLabel(iso)}
      </span>
    </div>
  );
}

/** Back arrow on phones (the list is the previous screen), close X once both panes are visible. */
export function ThreadBackButton({ onClick }: { onClick: () => void }) {
  return (
    <>
      <button
        type="button"
        onClick={onClick}
        aria-label="Back to conversations"
        className="tap flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neu-base text-slate-300 shadow-raised-low transition hover:text-slate-100 active:shadow-pressed-low md:hidden"
      >
        <ArrowLeftIcon size={16} />
      </button>
      <button
        type="button"
        onClick={onClick}
        aria-label="Close chat"
        className="tap hidden h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neu-base text-slate-400 shadow-raised-low transition hover:text-slate-200 active:shadow-pressed-low md:flex"
      >
        <XIcon size={14} />
      </button>
    </>
  );
}

export const THREAD_HEADER = "neu-groove-b flex items-center gap-3 px-3 py-3 md:px-4";

/**
 * The compose bar shared by 1:1 and group chat. text-body (16px) on the field
 * on purpose: smaller makes iOS zoom the fixed app shell on focus.
 */
export function ComposerBar({
  formRef,
  textareaRef,
  value,
  onChange,
  onKeyDown,
  onSubmit,
  sending,
  maxHeight,
  onFocusChange,
}: {
  formRef: RefObject<HTMLFormElement | null>;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (value: string) => void;
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  onSubmit: (e: FormEvent) => void;
  sending: boolean;
  maxHeight: number;
  /** Fires when the box gains or loses focus, i.e. the keyboard opening or closing. */
  onFocusChange?: (focused: boolean) => void;
}) {
  const canSend = !sending && value.trim().length > 0;
  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex min-w-0 items-end gap-2.5 neu-groove-t p-3">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => onFocusChange?.(true)}
        onBlur={() => onFocusChange?.(false)}
        placeholder="Write a message…"
        aria-label="Message"
        maxLength={2000}
        rows={1}
        enterKeyHint="send"
        className="min-h-9 min-w-0 flex-1 resize-none overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden rounded-3xl border border-(--neu-edge) bg-neu-base px-4 py-2.5 text-body text-slate-100 shadow-pressed-low outline-none transition placeholder:text-slate-500 focus:border-signal"
        style={{ maxHeight }}
      />
      <button
        type="submit"
        disabled={!canSend}
        aria-label="Send message"
        className="tap shrink-0 cursor-pointer rounded-full disabled:cursor-not-allowed"
      >
        <SendButton state={canSend ? "typing" : "idle"} />
      </button>
    </form>
  );
}
