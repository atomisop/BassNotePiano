"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { parentRemoveFriendAction, parentRespondToFriendAction } from "@/app/(dashboard)/parent/actions";
import type { ChildFriendRow, FriendReviewRow } from "@/lib/friendParentReview";

/**
 * A child's friends, for their parent: friendships waiting for approval (Approve or Decline), and the friends they have now (Remove).
 * A friendship with a child only starts when a parent approves it, so nothing here happens without the parent knowing.
 */
export function ChildFriends({ childId, childName, reviews, friends }: { childId: string; childName: string; reviews: FriendReviewRow[]; friends: ChildFriendRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  function run(key: string, job: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setBusy(key);
    setError(null);
    startTransition(async () => {
      const result = await job().catch(() => ({ ok: false as const, error: "That did not go through. Try again." }));
      setBusy(null);
      if (!result.ok) setError(result.error);
      else {
        setConfirmRemove(null);
        router.refresh();
      }
    });
  }

  const first = childName.split(" ")[0] || "Your child";
  return (
    <section aria-labelledby="child-friends" className="mt-6 rounded-card bg-neu-base p-4 shadow-raised-low md:p-5">
      <h2 id="child-friends" className="text-title font-semibold text-slate-50">
        {first}&apos;s friends
      </h2>
      <p className="mt-1 text-small text-slate-500">A friendship with {first} only starts when you approve it. You can remove a friend at any time.</p>

      {reviews.length > 0 && (
        <div className="mt-4">
          <p className="text-caption font-medium uppercase tracking-caps text-slate-500">Waiting for you</p>
          <ul className="mt-2 space-y-2">
            {reviews.map((r) => (
              <li key={r.requestId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3 bg-neu-base shadow-raised-low">
                <p className="min-w-0 truncate text-body text-slate-100">
                  {r.otherName}
                  {r.otherUsername ? <span className="text-slate-500"> @{r.otherUsername}</span> : null}
                </p>
                <div className="flex gap-2">
                  <button type="button" disabled={pending} onClick={() => run(`y:${r.requestId}`, () => parentRespondToFriendAction(childId, r.requestId, true))} className={buttonVariants({ variant: "primary", size: "sm" })}>
                    {busy === `y:${r.requestId}` ? "Approving…" : "Approve"}
                  </button>
                  <button type="button" disabled={pending} onClick={() => run(`n:${r.requestId}`, () => parentRespondToFriendAction(childId, r.requestId, false))} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                    {busy === `n:${r.requestId}` ? "Declining…" : "Decline"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4">
        <p className="text-caption font-medium uppercase tracking-caps text-slate-500">Friends now</p>
        {friends.length === 0 ? (
          <p className="mt-2 text-small text-slate-500">No friends yet. When {first} and someone both say yes, it shows up above for you to approve.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {friends.map((f) => (
              <li key={f.requestId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3 bg-neu-base shadow-raised-low">
                <p className="min-w-0 truncate text-body text-slate-100">
                  {f.name}
                  {f.username ? <span className="text-slate-500"> @{f.username}</span> : null}
                </p>
                {confirmRemove === f.requestId ? (
                  <div className="flex gap-2">
                    <button type="button" disabled={pending} onClick={() => run(`r:${f.requestId}`, () => parentRemoveFriendAction(childId, f.requestId))} className={buttonVariants({ variant: "secondary", size: "sm", className: "text-red-300 hover:text-red-200" })}>
                      {busy === `r:${f.requestId}` ? "Removing…" : `Yes, remove ${f.name}`}
                    </button>
                    <button type="button" onClick={() => setConfirmRemove(null)} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                      Keep
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setConfirmRemove(f.requestId)} className={buttonVariants({ variant: "ghost", size: "sm", className: "text-red-300 hover:text-red-200" })}>
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-3 text-small text-red-400">
          {error}
        </p>
      )}
    </section>
  );
}
