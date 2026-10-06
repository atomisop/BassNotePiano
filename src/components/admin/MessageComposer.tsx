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
  body: string;
  supportCta: boolean;
  read: boolean;
  readAt: string | null;
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
  const [recipients, setRecipients] = useState<MessageRecipient[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sendEmail, setSendEmail] = useState(false);
  const [supportCta, setSupportCta] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    if (query.trim().length < 2) {
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
  }, [query]);

  const visibleResults = results.filter((r) => !recipients.some((chosen) => chosen.id === r.id));

  function addRecipients(list: MessageRecipient[]) {
    setRecipients((current) => [...current, ...list.filter((r) => !current.some((c) => c.id === r.id))]);
    setQuery("");
    setResults([]);
  }

  async function send() {
    if (recipients.length === 0) return;
    setError(null);
    setNotice(null);
    setSubmitting(true);
    const result = await sendMessageAction(
      recipients.map((r) => r.id),
      title,
      body,
      sendEmail,
      supportCta,
    );
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const { sent, emailed, failed } = result.summary;
    setNotice(
      `Sent to ${sent} ${sent === 1 ? "person" : "people"}${sendEmail ? `, ${emailed} by email too` : ""}.${failed ? ` ${failed} could not be sent.` : ""}`,
    );
    setRecipients([]);
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
          {recipients.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {recipients.map((r) => (
                <span key={r.id} className="inline-flex items-center gap-1.5 rounded-full bg-neu-base py-1 pl-3 pr-1 text-small text-slate-100 shadow-pressed-low">
                  {r.name ?? r.email}
                  <button
                    type="button"
                    onClick={() => setRecipients((current) => current.filter((c) => c.id !== r.id))}
                    aria-label={`Remove ${r.name ?? r.email}`}
                    className="tap flex h-6 w-6 items-center justify-center transition neu-btn rounded-lg"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div>
            {/* The icon is centered on the input alone, so it stays in the bar when results open below. */}
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={recipients.length ? "Add someone else" : "Search a name or email"}
                className="w-full glass-surface-subtle py-2 pl-9 pr-3 text-body text-slate-100 outline-none transition focus:border-[rgb(var(--c-s-50)/0.6)]"
              />
            </div>
            {query.trim().length >= 2 && (
              <div className="mt-2 space-y-1.5">
                {searching && results.length === 0 ? (
                  <p className="px-1 text-small text-slate-500">Searching…</p>
                ) : visibleResults.length === 0 ? (
                  <p className="px-1 text-small text-slate-500">{results.length === 0 ? "No one found." : "Everyone found is already added."}</p>
                ) : (
                  <>
                    {visibleResults.length > 1 && (
                      <button
                        type="button"
                        onClick={() => addRecipients(visibleResults)}
                        className="tap neu-btn rounded-lg px-3 py-1.5 text-small inline-flex items-center"
                      >
                        Add all {visibleResults.length}
                      </button>
                    )}
                    {visibleResults.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => addRecipients([r])}
                        className="tap flex w-full flex-col rounded-lg bg-neu-base px-3 py-2 text-left shadow-raised-low transition hover:shadow-raised-mid active:shadow-pressed-low"
                      >
                        <span className="truncate text-small font-medium text-slate-100">{r.name ?? r.email}</span>
                        {r.name && <span className="truncate text-small text-slate-500">{r.email}</span>}
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>

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
          disabled={submitting || recipients.length === 0 || !title.trim() || !body.trim()}
          className="tap cta-sheen cta-fill mt-4 flex items-center justify-center rounded-lg px-4 py-2 text-small font-semibold disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting && <MorphingSquare size={12} className="mr-1.5 shrink-0" />}
          {submitting ? "Sending…" : recipients.length > 1 ? `Send to ${recipients.length} people` : "Send message"}
        </button>
      </div>

      <div className="glass-surface p-6">
        <h2 className="text-body text-slate-50 font-semibold">History</h2>
        <div className="mt-4 space-y-3">
          {sent.length === 0 ? (
            <p className="text-small text-slate-500">No messages yet.</p>
          ) : (
            sent.map((m) => {
              const open = openId === m.id;
              return (
                <div key={m.id} className="rounded-xl bg-neu-base shadow-raised-low">
                  <button
                    type="button"
                    onClick={() => setOpenId(open ? null : m.id)}
                    aria-expanded={open}
                    className="tap block w-full rounded-xl p-4 text-left transition hover:shadow-raised-mid active:shadow-pressed-low"
                  >
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
                  </button>
                  {open && (
                    <div className="border-t border-slate-50/10 px-4 pb-4 pt-3">
                      <p className="whitespace-pre-wrap text-small text-slate-200">{m.body}</p>
                      <p className="mt-3 text-small text-slate-500">
                        {m.recipientEmail} · sent {new Date(m.createdAt).toLocaleString()}
                        {m.readAt ? ` · read ${new Date(m.readAt).toLocaleString()}` : ""}
                      </p>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
