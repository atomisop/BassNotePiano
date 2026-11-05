"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { buttonVariants } from "@/components/ui/button";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { MessageSquare } from "@/components/ui/appIcons";
import { toast } from "@/components/ui/Toaster";
import { sendMessageAction } from "@/app/(dashboard)/admin/messages/actions";

const field =
  "w-full rounded-control bg-neu-base px-3.5 py-2.5 text-body text-slate-100 shadow-pressed-low outline-none placeholder:text-slate-500 focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Write to one student without leaving their page: the same message Inbox > Messages sends (into their Mail, and by email if you
 * choose), opened in a sheet from the student's quick actions.
 */
export function QuickMessageButton({ userId, name }: { userId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sendEmail, setSendEmail] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (!title.trim() || !body.trim()) return setError("Add a title and a message.");
    setBusy(true);
    setError(null);
    const result = await sendMessageAction([userId], title.trim(), body.trim(), sendEmail, false).catch(() => ({ ok: false as const, error: "Something went wrong." }));
    setBusy(false);
    if (!result.ok) return setError(result.error);
    toast.success(result.summary.emailed > 0 ? `Sent to ${name}, and by email` : `Sent to ${name}'s Mail`);
    setTitle("");
    setBody("");
    setOpen(false);
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonVariants({ variant: "secondary", size: "sm" })}>
        <MessageSquare aria-hidden className="h-4 w-4" />
        Message
      </button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setError(null);
        }}
        title={`Message ${name}`}
        description="It lands in their Mail in the app."
        footer={
          <button type="button" onClick={() => void send()} disabled={busy} className={buttonVariants({ variant: "primary", className: "w-full sm:w-auto" })}>
            {busy && <MorphingSquare size={14} className="mr-2 shrink-0" />}
            {busy ? "Sending…" : "Send"}
          </button>
        }
      >
        <div className="space-y-3">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title, e.g. About your next class" aria-label="Title" className={field} maxLength={120} />
          <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Message" aria-label="Message" rows={5} className={field} maxLength={4000} />
          <label className="flex cursor-pointer items-center gap-2.5 text-small text-slate-300">
            <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} className="h-4 w-4 accent-signal" />
            Also send it by email
          </label>
          {error && (
            <p role="alert" className="text-small text-red-400">
              {error}
            </p>
          )}
        </div>
      </Dialog>
    </>
  );
}
