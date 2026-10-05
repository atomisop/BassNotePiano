"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminAnnouncementRow } from "@/lib/announcements";
import { MorphingSquare } from "@/components/ui/morphing-square";
import {
  createAnnouncementAction,
  setAnnouncementActiveAction,
  deleteAnnouncementAction,
} from "@/app/(dashboard)/admin/announcements/actions";

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
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label="Also send this announcement by email"
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition ${
        checked ? "bg-[rgb(var(--c-a-400))]" : "bg-slate-700"
      }`}
    >
      <span
        className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-slate-50 transition-transform ${
          checked ? "translate-x-[20px]" : "translate-x-0"
        }`}
      />
    </button>
  );
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
    const result = await createAnnouncementAction(title, body, sendEmail);
    setSubmitting(false);
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
    // email can't) — same in-place confirm step this file already uses
    // for Delete below, gated only when the toggle is actually on.
    if (sendEmail) {
      setConfirmingEmail(true);
      return;
    }
    void publish();
  }

  return (
    <div className="glass-surface p-6">
      <h2 className="text-body text-slate-50 font-semibold">New announcement</h2>

      <div className="mt-4 space-y-3">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title, e.g. New scale added: Bati"
          maxLength={120}
          className="w-full glass-surface-subtle px-3 py-2 text-body text-slate-100 outline-none transition focus:border-[rgb(var(--c-s-50)/0.6)]"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Message…"
          maxLength={1000}
          rows={3}
          className="w-full resize-none glass-surface-subtle px-3 py-2 text-body text-slate-100 outline-none transition focus:border-[rgb(var(--c-s-50)/0.6)]"
        />
      </div>

      <div className="mt-4 flex items-center justify-between rounded-lg px-3 py-2.5 bg-neu-base shadow-raised-low">
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
        <div className="mt-4 space-y-2 rounded-lg p-3 bg-neu-base shadow-raised-low">
          <p className="text-small text-slate-50">
            This will email all {totalUsers} account{totalUsers === 1 ? "" : "s"}. Send it?
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirmingEmail(false)}
              disabled={submitting}
              className="tap flex-1 rounded-lg py-1.5 text-small font-medium text-slate-300 transition disabled:opacity-50 bg-neu-base shadow-raised-low hover:shadow-raised-mid active:shadow-pressed-low"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void publish()}
              disabled={submitting}
              className="tap cta-sheen cta-fill flex flex-1 items-center justify-center rounded-lg py-1.5 text-small font-semibold disabled:cursor-not-allowed disabled:opacity-60"
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
          className="tap cta-sheen cta-fill mt-4 flex items-center justify-center rounded-lg px-4 py-2 text-small font-semibold disabled:cursor-not-allowed disabled:opacity-60"
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

  async function handleToggleActive() {
    setBusy(true);
    await setAnnouncementActiveAction(announcement.id, !announcement.active);
    setBusy(false);
    onChanged();
  }

  async function handleDelete() {
    setBusy(true);
    await deleteAnnouncementAction(announcement.id);
    setBusy(false);
    setDeleting(false);
    onChanged();
  }

  return (
    <div className="rounded-xl p-4 bg-neu-base shadow-raised-low">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-small font-medium text-slate-100">{announcement.title}</p>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-small font-medium ${
                announcement.active ? "bg-slate-50/15 text-slate-100" : "bg-slate-700/50 text-slate-400"
              }`}
            >
              {announcement.active ? "Active" : "Inactive"}
            </span>
          </div>
          <p className="mt-1 text-small text-slate-400">{announcement.body}</p>
          <p className="mt-2 text-small text-slate-600">
            {relativeTime(announcement.createdAt)} · {announcement.dismissedCount} of {totalUsers} dismissed
          </p>
        </div>
      </div>

      {deleting ? (
        <div className="mt-3 space-y-2">
          <p className="text-small text-red-400">Delete this announcement? This can&apos;t be undone.</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setDeleting(false)}
              disabled={busy}
              className="tap flex-1 rounded-lg py-1.5 text-small font-medium text-slate-300 transition disabled:opacity-50 bg-neu-base shadow-raised-low hover:shadow-raised-mid active:shadow-pressed-low"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={busy}
              className="tap flex flex-1 items-center justify-center rounded-lg bg-red-500/95 py-1.5 text-small font-semibold text-slate-950 transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy && <MorphingSquare size={12} className="mr-1.5 shrink-0" />}
              {busy ? "Deleting…" : "Confirm delete"}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={handleToggleActive}
            disabled={busy}
            className="tap rounded-lg px-3 py-1.5 text-small font-medium text-slate-300 transition disabled:cursor-not-allowed disabled:opacity-60 bg-neu-base shadow-raised-low hover:shadow-raised-mid active:shadow-pressed-low"
          >
            {announcement.active ? "Deactivate" : "Reactivate"}
          </button>
          <button
            type="button"
            onClick={() => setDeleting(true)}
            disabled={busy}
            className="tap rounded-lg border border-red-400/20 px-3 py-1.5 text-small font-medium text-red-400 transition hover:border-red-400/40 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Delete
          </button>
        </div>
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

      <div className="glass-surface p-6">
        <h2 className="text-body text-slate-50 font-semibold">History</h2>

        <div className="mt-4 space-y-3">
          {initialAnnouncements.length === 0 ? (
            <p className="text-small text-slate-500">No announcements yet.</p>
          ) : (
            initialAnnouncements.map((a) => (
              <AnnouncementRow key={a.id} announcement={a} totalUsers={totalUsers} onChanged={refresh} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
