"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { Switch } from "@/components/ui/switch";
import {
  searchRecipientsAction,
  sendMessageAction,
  type MessageRecipient,
} from "@/app/(dashboard)/admin/messages/actions";

interface SentRow {
  id: string;
  title: string;
  recipientName: string | null;
  recipientEmail: string;
  supportCta: boolean;
  read: boolean;
  createdAt: string;
}

function relativeTime(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const EMAIL_NOTE = {
  sent: "Delivered to their Mail and by email.",
  off: "Delivered to their Mail.",
  "opted-out": "Delivered to their Mail. No email: they turned off message emails.",
  failed: "Delivered to their Mail. The email could not be sent.",
} as const;

export function MessageComposer({ sent }: { sent: SentRow[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MessageRecipient[]>([]);
  const [searching, setSearching] = useState(false);
  const [recipient, setRecipient] = useState<MessageRecipient | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sendEmail, setSendEmail] = useState(false);
  const [supportCta, setSupportCta] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    if (recipient || query.trim().length < 2) {
      setResults([]);
      return;
    }
    const id = ++requestId.current;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const found = await searchRecipientsAction(query);
        if (id === requestId.current) setResults(found);
      } finally {
        if (id === requestId.current) setSearching(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query, recipient]);

  async function send() {
    if (!recipient) return;
    setError(null);
    setNotice(null);
    setSubmitting(true);
    const result = await sendMessageAction(recipient.id, title, body, sendEmail, supportCta);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setNotice(`Sent to ${recipient.name ?? recipient.email}. ${EMAIL_NOTE[result.result.email]}`);
    setRecipient(null);
    setQuery("");
    setTitle("");
    setBody("");
    setSendEmail(false);
    setSupportCta(false);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="glass-surface p-6">
        <h2 className="text-body text-slate-50 font-semibold">New message</h2>

        <div className="mt-4 space-y-3">
          {recipient ? (
            <div className="flex items-center justify-between gap-3 rounded-lg bg-neu-base px-3 py-2.5 shadow-pressed-low">
              <div className="min-w-0">
                <p className="truncate text-small font-medium text-slate-100">{recipient.name ?? recipient.email}</p>
                {recipient.name && <p className="truncate text-small text-slate-500">{recipient.email}</p>}
              </div>
              <button
                type="button"
                onClick={() => setRecipient(null)}
                aria-label="Choose someone else"
                className="tap flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-neu-base text-slate-300 shadow-raised-low active:shadow-pressed-low"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div>
              {/* The icon is centered on the input alone, so it stays in the bar when results open below. */}
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search a name or email"
                  className="w-full glass-surface-subtle py-2 pl-9 pr-3 text-body text-slate-100 outline-none transition focus:border-[rgb(var(--c-s-50)/0.6)]"
                />
              </div>
              {query.trim().length >= 2 && (
                <div className="mt-2 space-y-1.5">
                  {searching && results.length === 0 ? (
                    <p className="px-1 text-small text-slate-500">Searching…</p>
                  ) : results.length === 0 ? (
                    <p className="px-1 text-small text-slate-500">No one found.</p>
                  ) : (
                    results.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => {
                          setRecipient(r);
                          setResults([]);
                        }}
                        className="tap flex w-full flex-col rounded-lg bg-neu-base px-3 py-2 text-left shadow-raised-low transition hover:shadow-raised-mid active:shadow-pressed-low"
                      >
                        <span className="truncate text-small font-medium text-slate-100">{r.name ?? r.email}</span>
                        {r.name && <span className="truncate text-small text-slate-500">{r.email}</span>}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title, e.g. About your last payment"
            maxLength={120}
            className="w-full glass-surface-subtle px-3 py-2 text-body text-slate-100 outline-none transition focus:border-[rgb(var(--c-s-50)/0.6)]"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Message…"
            maxLength={2000}
            rows={5}
            className="w-full resize-none glass-surface-subtle px-3 py-2 text-body text-slate-100 outline-none transition focus:border-[rgb(var(--c-s-50)/0.6)]"
          />
        </div>

        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between rounded-lg bg-neu-base px-3 py-2.5 shadow-raised-low">
            <p className="text-small font-medium text-slate-200">Send email</p>
            <Switch checked={sendEmail} onCheckedChange={setSendEmail} aria-label="Also send this message by email" />
          </div>
          <div className="flex items-center justify-between rounded-lg bg-neu-base px-3 py-2.5 shadow-raised-low">
            <p className="text-small font-medium text-slate-200">Include &ldquo;Click here to contact support&rdquo;</p>
            <Switch checked={supportCta} onCheckedChange={setSupportCta} aria-label="Include a contact support link" />
          </div>
        </div>

        {error && <p className="mt-3 text-small text-red-400">{error}</p>}
        {notice && <p className="mt-3 text-small text-slate-300">{notice}</p>}

        <button
          type="button"
          onClick={() => void send()}
          disabled={submitting || !recipient || !title.trim() || !body.trim()}
          className="tap cta-sheen cta-fill mt-4 flex items-center justify-center rounded-lg px-4 py-2 text-small font-semibold disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting && <MorphingSquare size={12} className="mr-1.5 shrink-0" />}
          {submitting ? "Sending…" : "Send message"}
        </button>
      </div>

      <div className="glass-surface p-6">
        <h2 className="text-body text-slate-50 font-semibold">History</h2>
        <div className="mt-4 space-y-3">
          {sent.length === 0 ? (
            <p className="text-small text-slate-500">No messages yet.</p>
          ) : (
            sent.map((m) => (
              <div key={m.id} className="rounded-xl bg-neu-base p-4 shadow-raised-low">
                <div className="flex items-start justify-between gap-3">
                  <p className="truncate text-small font-medium text-slate-100">{m.title}</p>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-small font-medium ${m.read ? "bg-slate-50/15 text-slate-100" : "bg-slate-700/50 text-slate-400"}`}
                  >
                    {m.read ? "Read" : "Unread"}
                  </span>
                </div>
                <p className="mt-1 text-small text-slate-400">
                  To {m.recipientName ?? m.recipientEmail}
                  {m.supportCta ? " · with contact support" : ""}
                </p>
                <p className="mt-1 text-small text-slate-600">{relativeTime(m.createdAt)}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
