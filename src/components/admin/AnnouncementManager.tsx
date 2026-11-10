"use client";

import { Switch } from "@/components/ui/switch";
import { useState } from "react";
import { toast } from "@/components/ui/Toaster";
import { useRouter } from "next/navigation";
import type { AdminAnnouncementRow } from "@/lib/announcements";
import { MorphingSquare } from "@/components/ui/morphing-square";
import {
  createAnnouncementAction,
  setAnnouncementActiveAction,
  deleteAnnouncementAction,
  updateAnnouncementAction,
} from "@/app/(dashboard)/admin/announcements/actions";
import { buttonVariants } from "@/components/ui/button";
import { Hint } from "@/components/ui/Hint";
import { StatusDot } from "@/components/ui/StatusDot";
import { CardFoot, Meta } from "@/components/ui/CardKit";

const editField = "h-11 w-full rounded-control border border-(--field-edge) bg-neu-base px-4 text-body text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-ring";

function relativeTime(iso: Date): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function EmailToggle({ checked, onChange }: { checked: boolean; onChange: (next: boolean) => void }) {
  return <Switch checked={checked} onCheckedChange={onChange} aria-label="Also send this announcement by email" />;
}

function ComposeForm({ totalUsers, onPublished }: { totalUsers: number; onPublished: () => void }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sendEmail, setSendEmail] = useState(false);
  const [confirmingEmail, setConfirmingEmail] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function publish() {
    setError(null);
    setSubmitting(true);
    const hold = await toast.held("Publishing to everyone", () => createAnnouncementAction(title, body, sendEmail), { mail: true });
    setSubmitting(false);
    if (hold.undone) return;
    const result = hold.value;
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setTitle("");
    setBody("");
    setSendEmail(false);
    setConfirmingEmail(false);
    onPublished();
  }

  function handlePublishClick() {
    // Emailing every account is the one irreversible-feeling part of this
    // form (an in-app banner can be deactivated after the fact; a sent
    // email can't), same in-place confirm step this file already uses
    // for Delete below, gated only when the toggle is actually on.
    if (sendEmail) {
      setConfirmingEmail(true);
      return;
    }
    void publish();
  }

  return (
    <div className="glass-surface p-4 md:p-6">
      <h2 className="text-title text-slate-50 font-semibold">New announcement</h2>

      <div className="mt-4 space-y-3">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title, e.g. New scale added: Bati"
          maxLength={120}
          className="w-full glass-surface-subtle px-3 py-2 text-body text-slate-100 outline-none transition focus:border-slate-50/60"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Message…"
          maxLength={1000}
          rows={3}
          className="w-full resize-none glass-surface-subtle px-3 py-2 text-body text-slate-100 outline-none transition focus:border-slate-50/60"
        />
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-50/8 pt-3">
        <div>
          <p className="text-small font-medium text-slate-200">Send email</p>
        </div>
        <EmailToggle
          checked={sendEmail}
          onChange={(next) => {
            setSendEmail(next);
            setConfirmingEmail(false);
          }}
        />
      </div>

      {error && <p className="mt-2 text-small text-red-400">{error}</p>}

      {confirmingEmail ? (
        <div className="mt-4 space-y-2 rounded-control bg-amber-300/10 p-3 ring-1 ring-inset ring-amber-300/20">
          <p className="text-small text-slate-50">
            This will email all {totalUsers} account{totalUsers === 1 ? "" : "s"}. Send it?
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirmingEmail(false)}
              disabled={submitting}
              className={buttonVariants({ variant: "secondary", className: "flex-1" })}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void publish()}
              disabled={submitting}
              className={buttonVariants({ variant: "primary", className: "flex-1" })}
            >
              {submitting && <MorphingSquare size={12} className="mr-1.5 shrink-0" />}
              {submitting ? "Sending…" : `Confirm: email ${totalUsers}`}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={handlePublishClick}
          disabled={submitting || !title.trim() || !body.trim()}
          className={buttonVariants({ variant: "primary", size: "sm", className: "mt-4 flex" })}
        >
          {submitting && <MorphingSquare size={12} className="mr-1.5 shrink-0" />}
          {submitting ? "Publishing…" : "Publish to everyone"}
        </button>
      )}
    </div>
  );
}

function AnnouncementRow({ announcement, totalUsers, onChanged }: { announcement: AdminAnnouncementRow; totalUsers: number; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  // Matches the in-place confirm pattern used everywhere else in admin
  // (PaymentQueue, StudentQueue, AdminLessonManager) instead of a native
  // confirm() dialog, which looks out of place next to the custom UI.
  const [deleting, setDeleting] = useState(false);
  const [gone, setGone] = useState(false);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(announcement.title);
  const [body, setBody] = useState(announcement.body);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setError(null);
    setBusy(true);
    const result = await updateAnnouncementAction(announcement.id, title, body).catch(() => ({ ok: false as const, error: "Something went wrong." }));
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setEditing(false);
    onChanged();
  }

  async function handleToggleActive() {
    setBusy(true);
    await setAnnouncementActiveAction(announcement.id, !announcement.active);
    setBusy(false);
    onChanged();
  }

  function handleDelete() {
    setDeleting(false);
    setGone(true);
    // The real delete waits 5 seconds so Undo can still cancel it.
    toast.deferred(
      "Announcement deleted",
      async () => {
        await deleteAnnouncementAction(announcement.id);
        onChanged();
      },
      () => setGone(false),
    );
  }

  if (gone) return null;

  return (
    <div className="px-4 py-4">
      {/* The title is the line to read; whether it is showing now is one word at the right, and the rest is quiet. */}
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 text-body font-semibold text-slate-50">{announcement.title}</p>
        <StatusDot tone={announcement.active ? "success" : "neutral"} className="shrink-0 text-slate-400">
          {announcement.active ? "Active" : "Inactive"}
        </StatusDot>
      </div>
      <p className="mt-1 text-small text-slate-400">{announcement.body}</p>
      <Meta className="mt-2" items={[relativeTime(announcement.createdAt), `${announcement.dismissedCount} of ${totalUsers} dismissed`]} />

      {editing ? (
        <div className="mt-3 grid gap-3">
          <label className="grid gap-1.5">
            <span className="text-small font-medium text-slate-200">Title</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} className={editField} />
          </label>
          <label className="grid gap-1.5">
            <span className="text-small font-medium text-slate-200">Message</span>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={1000} rows={4} className={`${editField} h-auto resize-none py-2.5`} />
          </label>
          <p className="text-small text-slate-500"><Hint>The banner and the bell entries change at once. Emails already sent stay as they were.</Hint></p>
          {error && <p className="text-small text-red-400">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setTitle(announcement.title);
                setBody(announcement.body);
                setError(null);
              }}
              disabled={busy}
              className={buttonVariants({ variant: "secondary", size: "sm" })}
            >
              Cancel
            </button>
            <button type="button" onClick={() => void handleSave()} disabled={busy || !title.trim() || !body.trim()} className={buttonVariants({ variant: "primary", size: "sm" })}>
              {busy && <MorphingSquare size={14} className="mr-1.5 shrink-0" />}
              Save
            </button>
          </div>
        </div>
      ) : deleting ? (
        <div className="mt-3 space-y-2">
          <p className="text-small text-red-400">Delete this announcement? This can&apos;t be undone.</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setDeleting(false)}
              disabled={busy}
              className={buttonVariants({ variant: "secondary", size: "sm", className: "flex-1" })}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={busy}
              className={buttonVariants({ variant: "danger", size: "sm", className: "flex-1" })}
            >
              {busy && <MorphingSquare size={12} className="mr-1.5 shrink-0" />}
              {busy ? "Deleting…" : "Confirm delete"}
            </button>
          </div>
        </div>
      ) : (
        <CardFoot className="mt-3 justify-between border-t-0 pt-0">
          {/* Delete is quiet red text at the far left, away from the everyday buttons, behind its confirm. */}
          <button
            type="button"
            onClick={() => setDeleting(true)}
            disabled={busy}
            className={buttonVariants({ variant: "ghost", size: "sm", className: "-ml-2 text-red-300 hover:text-red-200" })}
          >
            Delete
          </button>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button type="button" onClick={() => setEditing(true)} disabled={busy} className={buttonVariants({ variant: "ghost", size: "sm" })}>
              Edit
            </button>
            <button
              type="button"
              onClick={handleToggleActive}
              disabled={busy}
              className={buttonVariants({ variant: "secondary", size: "sm" })}
            >
              {busy && <MorphingSquare size={14} className="mr-1.5 shrink-0" />}
              {announcement.active ? "Deactivate" : "Reactivate"}
            </button>
          </div>
        </CardFoot>
      )}
    </div>
  );
}

export function AnnouncementManager({
  initialAnnouncements,
  totalUsers,
}: {
  initialAnnouncements: AdminAnnouncementRow[];
  totalUsers: number;
}) {
  const router = useRouter();

  function refresh() {
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <ComposeForm totalUsers={totalUsers} onPublished={refresh} />

      <section aria-label="History">
        <h2 className="flex items-baseline justify-between gap-3 px-1 text-title font-semibold text-slate-50">
          History
          {initialAnnouncements.length > 0 && <span className="text-small font-normal tabular-nums text-slate-500">{initialAnnouncements.length}</span>}
        </h2>
        {initialAnnouncements.length === 0 ? (
          <p className="mt-3 px-1 text-small text-slate-500">No announcements yet.</p>
        ) : (
          <div className="glass-surface mt-3 divide-y divide-slate-50/8 overflow-hidden">
            {initialAnnouncements.map((a) => (
              <AnnouncementRow key={a.id} announcement={a} totalUsers={totalUsers} onChanged={refresh} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
