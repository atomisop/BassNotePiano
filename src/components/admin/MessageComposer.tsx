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
import { ViewMore } from "@/components/ui/ViewMore";
import { StatusDot } from "@/components/ui/StatusDot";
import { Meta } from "@/components/ui/CardKit";

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
      <div className="glass-surface p-4 md:p-6">
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

        <div className="mt-4 space-y-1 border-t border-slate-50/8 pt-3">
          <p className="pb-1 text-small text-slate-500">
            {sendEmail ? "They get it in their Mail inbox in the app and by email." : "They get it in their Mail inbox in the app only."}
          </p>
          <div className="flex items-center justify-between gap-3 py-1">
            <label htmlFor="composer-send-email" className="cursor-pointer text-small font-medium text-slate-200">Also send by email</label>
            <Switch id="composer-send-email" checked={sendEmail} onCheckedChange={setSendEmail} aria-label="Also send this message by email" />
          </div>
          <div className="flex items-center justify-between gap-3 py-1">
            <label htmlFor="composer-support-cta" className="cursor-pointer text-small font-medium text-slate-200">Add a &ldquo;Contact support&rdquo; button to the message</label>
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

      {/* History as rows, newest first: the title is the line to read, who it went to and when are quiet under it, and whether
          it was read (or answered, linking to the reply) is one small word at the right. The first few show; the rest fold behind "View more". */}
      <section aria-label="History">
        <h2 className="flex items-baseline justify-between gap-3 px-1 text-title font-semibold text-slate-50">
          History
          {sent.length > 0 && <span className="text-small font-normal tabular-nums text-slate-500">{sent.length}</span>}
        </h2>
        {sent.length === 0 ? (
          <p className="mt-3 px-1 text-small text-slate-500">No messages yet.</p>
        ) : (
          <div className="glass-surface mt-3 divide-y divide-slate-50/8 overflow-hidden">
            <ViewMore items={sent} initial={8} step={20}>
            {(m) => {
              const open = openId === m.id;
              return (
                <div key={m.id} className="relative">
                  <button
                    type="button"
                    onClick={() => setOpenId(open ? null : m.id)}
                    aria-expanded={open}
                    className="tap block w-full py-3 pl-4 pr-24 text-left transition hover:bg-slate-50/5"
                  >
                    <p className="min-w-0 truncate text-body font-semibold text-slate-50">{m.title}</p>
                    <Meta
                      className="mt-0.5 truncate"
                      items={[`To ${m.recipientName ?? m.recipientEmail}`, m.supportCta ? "with contact support" : null, relativeTime(m.createdAt)]}
                    />
                  </button>
                  {/* Read or unread is one small word at the right. A reply opens a Support Chat case, so "Replied" goes straight to it.
                      Kept outside the row's button (no link inside a button). */}
                  {m.supportCaseId ? (
                    <Link
                      href={`/admin/support/${m.supportCaseId}?filter=all`}
                      className="tap absolute right-4 top-3 inline-flex items-center rounded-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <StatusDot tone="accent" className="text-caption text-signal-fg">Replied</StatusDot>
                    </Link>
                  ) : (
                    <StatusDot tone={m.read ? "success" : "neutral"} className="pointer-events-none absolute right-4 top-3.5 text-caption text-slate-400">
                      {m.read ? "Read" : "Unread"}
                    </StatusDot>
                  )}
                  <Collapse open={open}>
                    <div className="border-t border-slate-50/8 px-4 pb-4 pt-3">
                      <p className="whitespace-pre-wrap text-body text-slate-200">{m.body}</p>
                      <p className="mt-3 text-small text-slate-500">
                        {m.recipientEmail} · sent {new Date(m.createdAt).toLocaleString(undefined, { timeZone: "America/New_York" })}
                        {m.readAt ? ` · read ${new Date(m.readAt).toLocaleString(undefined, { timeZone: "America/New_York" })}` : ""}
                      </p>
                    </div>
                  </Collapse>
                </div>
              );
            }}
            </ViewMore>
          </div>
        )}
      </section>
    </div>
  );
}
