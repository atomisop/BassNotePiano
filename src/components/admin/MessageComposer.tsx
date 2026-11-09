"use client";

import { Collapse } from "@/components/ui/Collapse";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search, X } from "@/components/ui/appIcons";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { Switch } from "@/components/ui/switch";
import {
  searchRecipientsAction,
  sendMessageAction,
  type MessageRecipient,
} from "@/app/(dashboard)/admin/messages/actions";
import { buttonVariants } from "@/components/ui/button";
import { toast } from "@/components/ui/Toaster";

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
  /** They answered: the Support Chat case their reply opened. */
  supportCaseId: string | null;
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

/** `prefill`: people picked on another screen (`/admin/messages?to=...`), already in the To list. */
export function MessageComposer({ sent, prefill = [] }: { sent: SentRow[]; prefill?: MessageRecipient[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MessageRecipient[]>([]);
  const [searching, setSearching] = useState(false);
  const [recipients, setRecipients] = useState<MessageRecipient[]>(prefill);
  const titleRef = useRef<HTMLInputElement>(null);
  // Arriving with people filled in, the next thing to type is the title.
  useEffect(() => {
    if (prefill.length > 0) titleRef.current?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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
    const hold = await toast.held(
      "Sending the message",
      () =>
        sendMessageAction(
          recipients.map((r) => r.id),
          title,
          body,
          sendEmail,
          supportCta,
        ),
      { mail: sendEmail },
    );
    setSubmitting(false);
    if (hold.undone) return;
    const result = hold.value;
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
        <h2 className="text-title text-slate-50 font-semibold">New message</h2>

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
                    className={buttonVariants({ variant: "secondary", size: "iconSm" })}
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
                className="w-full glass-surface-subtle py-2 pl-9 pr-3 text-body text-slate-100 outline-none transition focus:border-slate-50/60"
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
                        className={buttonVariants({ variant: "secondary", size: "sm" })}
                      >
                        Add all {visibleResults.length}
                      </button>
                    )}
                    {visibleResults.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => addRecipients([r])}
                        className={buttonVariants({ variant: "secondary", size: "sm", className: "w-full flex-col text-left" })}
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
            ref={titleRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title, e.g. About your last payment"
            maxLength={120}
            className="w-full glass-surface-subtle px-3 py-2 text-body text-slate-100 outline-none transition focus:border-slate-50/60"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Message…"
            maxLength={2000}
            rows={5}
            className="w-full resize-none glass-surface-subtle px-3 py-2 text-body text-slate-100 outline-none transition focus:border-slate-50/60"
          />
        </div>

        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between rounded-lg bg-neu-base px-3 py-2.5 shadow-raised-low">
            <label htmlFor="composer-send-email" className="cursor-pointer text-small font-medium text-slate-200">Send email</label>
            <Switch id="composer-send-email" checked={sendEmail} onCheckedChange={setSendEmail} aria-label="Also send this message by email" />
          </div>
          <div className="flex items-center justify-between rounded-lg bg-neu-base px-3 py-2.5 shadow-raised-low">
            <label htmlFor="composer-support-cta" className="cursor-pointer text-small font-medium text-slate-200">Include &ldquo;Click here to contact support&rdquo;</label>
            <Switch id="composer-support-cta" checked={supportCta} onCheckedChange={setSupportCta} aria-label="Include a contact support link" />
          </div>
        </div>

        {error && <p className="mt-3 text-small text-red-400">{error}</p>}
        {notice && <p className="mt-3 text-small text-slate-300">{notice}</p>}

        <button
          type="button"
          onClick={() => void send()}
          disabled={submitting || recipients.length === 0 || !title.trim() || !body.trim()}
          className={buttonVariants({ variant: "primary", className: "mt-4" })}
        >
          {submitting && <MorphingSquare size={12} className="mr-1.5 shrink-0" />}
          {submitting ? "Sending…" : recipients.length > 1 ? `Send to ${recipients.length} people` : "Send message"}
        </button>
      </div>

      <div className="glass-surface p-6">
        <h2 className="text-title text-slate-50 font-semibold">History</h2>
        <div className="mt-4 space-y-3">
          {sent.length === 0 ? (
            <p className="text-small text-slate-500">No messages yet.</p>
          ) : (
            sent.map((m) => {
              const open = openId === m.id;
              return (
                <div key={m.id} className="relative rounded-xl bg-neu-base shadow-raised-low">
                  <button
                    type="button"
                    onClick={() => setOpenId(open ? null : m.id)}
                    aria-expanded={open}
                    className="tap block w-full rounded-xl p-4 pr-24 text-left transition hover:shadow-raised-mid active:shadow-pressed-low"
                  >
                    <p className="truncate text-small font-medium text-slate-100">{m.title}</p>
                    <p className="mt-1 text-small text-slate-400">
                      To {m.recipientName ?? m.recipientEmail}
                      {m.supportCta ? " · with contact support" : ""}
                    </p>
                    <p className="mt-1 text-small text-slate-500">{relativeTime(m.createdAt)}</p>
                  </button>
                  {/* A reply opens a Support Chat case: "Replied" goes straight to it. Kept outside the row's button (no link in a button). */}
                  {m.supportCaseId ? (
                    <Link
                      href={`/admin/support/${m.supportCaseId}?filter=all`}
                      className="tap absolute right-3 top-3 inline-flex items-center rounded-full bg-signal/16 px-2 py-0.5 text-small font-medium text-signal-fg hover:underline"
                    >
                      Replied
                    </Link>
                  ) : (
                    <span
                      className={`pointer-events-none absolute right-3 top-3 rounded-full px-2 py-0.5 text-small font-medium ${m.read ? "bg-slate-50/15 text-slate-100" : "bg-slate-700/50 text-slate-400"}`}
                    >
                      {m.read ? "Read" : "Unread"}
                    </span>
                  )}
                  <Collapse open={open}>
                    <div className="border-t border-slate-50/10 px-4 pb-4 pt-3">
                      <p className="whitespace-pre-wrap text-small text-slate-200">{m.body}</p>
                      <p className="mt-3 text-small text-slate-500">
                        {m.recipientEmail} · sent {new Date(m.createdAt).toLocaleString()}
                        {m.readAt ? ` · read ${new Date(m.readAt).toLocaleString()}` : ""}
                      </p>
                    </div>
                  </Collapse>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
