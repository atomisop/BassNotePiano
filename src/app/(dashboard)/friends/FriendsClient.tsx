"use client";

import { useState, type FormEvent } from "react";
import { Avatar as UiAvatar } from "@/components/ui/Avatar";
import Link from "next/link";
import { Ban } from "lucide-react";
import { useRouter } from "next/navigation";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { useAction } from "@/hooks/useAction";
import {
  searchUsersAction,
  sendFriendRequestAction,
  respondToFriendRequestAction,
  blockUserAction,
  unblockUserAction,
} from "./actions";
import { TwoPaneLayout, WideLayout } from "@/components/layout/PageLayouts";
import { OwnerStarBadge, useIsOwner } from "@/components/ui/OwnerStar";
import { buttonVariants } from "@/components/ui/button";
import { announceChange } from "@/lib/liveEvents";

interface PublicProfile {
  id: string;
  username: string | null;
  name: string | null;
  image: string | null;
}

interface FriendsClientProps {
  username: string | null;
  friends: PublicProfile[];
  receivedRequests: { id: string; sender: PublicProfile }[];
  sentRequests: { id: string; receiver: PublicProfile }[];
  blocked: { id: string; user: PublicProfile }[];
}

function Avatar({ profile }: { profile: PublicProfile }) {
  const isOwner = useIsOwner(profile.id);
  return (
    <div className="relative shrink-0">
      <UiAvatar image={profile.image} label={profile.name ?? profile.username ?? "?"} size="md" className="h-9 w-9" />
      {isOwner && <OwnerStarBadge />}
    </div>
  );
}

function ProfileLine({ profile }: { profile: PublicProfile }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-small text-slate-100">{profile.name ?? "Unnamed"}</p>
      {profile.username && <p className="truncate text-small text-slate-500">@{profile.username}</p>}
    </div>
  );
}

function SectionCard({
  title,
  description,
  children,
  id,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <div id={id} className="glass-surface scroll-mt-24 p-6">
      <h2 className="text-title text-slate-50 font-semibold">{title}</h2>
      {description && <p className="mt-1 text-small text-slate-500">{description}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}

export function FriendsClient({ username, friends: allFriends, receivedRequests: allReceived, sentRequests, blocked: allBlocked }: FriendsClientProps) {
  const router = useRouter();
  // Optimistic: a row the person just answered, blocked or unblocked leaves its list at once; if the server refuses, it comes back.
  const [gone, setGone] = useState<Set<string>>(new Set());
  const hide = (id: string) => setGone((prev) => new Set(prev).add(id));
  const unhide = (id: string) =>
    setGone((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  const friends = allFriends.filter((f) => !gone.has(`block:${f.id}`));
  const receivedRequests = allReceived.filter((r) => !gone.has(`req:${r.id}`));
  const blocked = allBlocked.filter((b) => !gone.has(`unblock:${b.user.id}`));
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PublicProfile[]>([]);
  const action = useAction();
  const searching = action.isPending("search");
  const busy = "disabled:cursor-not-allowed disabled:opacity-60";
  const spin = <MorphingSquare size={12} className="mr-1.5 shrink-0" />;
  const [requestError, setRequestError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<Set<string>>(new Set());
  // Block used to fire on a single click. Unlike Reject (turning down a
  // stranger's incoming request, low-stakes either way), this ends an
  // existing friendship, so it gets the same one-more-click safety net as
  // every other hard-to-walk-back admin/account action in the app.
  const [blockingId, setBlockingId] = useState<string | null>(null);

  async function handleSearch(e: FormEvent) {
    e.preventDefault();
    setRequestError(null);
    const found = await action.run(() => searchUsersAction(query), "search");
    if (found) setResults(found);
  }

  async function handleAddFriend(profile: PublicProfile) {
    if (!profile.username) return;
    setRequestError(null);
    const username = profile.username;
    // Shows "Request sent" straight away; taken back if it fails.
    setSentTo((prev) => new Set(prev).add(profile.id));
    await action.run(async () => {
      const result = await sendFriendRequestAction(username);
      if (!result.ok) {
        setSentTo((prev) => {
          const next = new Set(prev);
          next.delete(profile.id);
          return next;
        });
        setRequestError(result.error);
        return;
      }
      router.refresh();
      announceChange("notifications");
    }, `add:${profile.id}`);
  }

  async function handleRespond(requestId: string, accept: boolean) {
    hide(`req:${requestId}`);
    const done = await action.run(async () => {
      try {
        await respondToFriendRequestAction(requestId, accept);
      } catch (err) {
        unhide(`req:${requestId}`);
        throw err;
      }
      router.refresh();
      announceChange("notifications");
      return true;
    }, `${accept ? "accept" : "reject"}:${requestId}`);
    if (!done) unhide(`req:${requestId}`);
  }

  async function handleBlock(userId: string) {
    hide(`block:${userId}`);
    setBlockingId(null);
    const done = await action.run(async () => {
      try {
        await blockUserAction(userId);
      } catch (err) {
        unhide(`block:${userId}`);
        throw err;
      }
      router.refresh();
      announceChange("notifications");
      return true;
    }, `block:${userId}`);
    if (!done) unhide(`block:${userId}`);
  }

  async function handleUnblock(userId: string) {
    hide(`unblock:${userId}`);
    const done = await action.run(async () => {
      try {
        await unblockUserAction(userId);
      } catch (err) {
        unhide(`unblock:${userId}`);
        throw err;
      }
      router.refresh();
      announceChange("notifications");
      return true;
    }, `unblock:${userId}`);
    if (!done) unhide(`unblock:${userId}`);
  }

  if (!username) {
    return (
      <WideLayout className="space-y-6">
        <div>
          <p className="text-small font-medium uppercase tracking-caps text-slate-50/80">Social</p>
          <h1 className="font-hero text-hero font-bold text-balance mt-1.5 text-slate-50">Friends</h1>
        </div>
        <SectionCard title="Set a username first">
          <Link
            href="/profile"
            className={buttonVariants({ variant: "primary", size: "sm", className: "inline-block" })}
          >
            Go to your profile
          </Link>
        </SectionCard>
      </WideLayout>
    );
  }

  return (
    <TwoPaneLayout
      mobile="stack"
      header={
        <div>
          <p className="text-small font-medium uppercase tracking-caps text-slate-50/80">Social</p>
          <h1 className="font-hero text-hero font-bold text-balance mt-1.5 text-slate-50">Friends</h1>
          <p className="mt-1 text-small text-slate-500">
            You&apos;re <span className="text-slate-300">@{username}</span>.
          </p>
        </div>
      }
      list={
        <div className="space-y-6">
          <SectionCard title={`Friends (${friends.length})`}>
            {friends.length === 0 ? (
              <div className="flex flex-col items-center gap-1 py-6 text-center">
                <p className="text-body font-semibold text-slate-100">No friends yet</p>
                <p className="max-w-[32ch] text-small text-slate-400">Search a username above to send a friend request.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {friends.map((friend) => (
                  <div key={friend.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg p-2.5 bg-neu-base shadow-raised-low">
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar profile={friend} />
                      <ProfileLine profile={friend} />
                    </div>
                    {blockingId === friend.id ? (
                      <span className="flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg border border-red-900 bg-neu-base shadow-pressed-low px-3 py-1.5 text-small text-red-300">
                        Block {friend.name ?? friend.username ?? "them"}?
                        <button
                          type="button"
                          onClick={() => handleBlock(friend.id)}
                          disabled={action.pending}
                          className={`tap inline-flex items-center px-2 font-semibold underline underline-offset-2 ${busy}`}
                        >
                          {action.isPending(`block:${friend.id}`) && spin}
                          Confirm
                        </button>
                        <button
                          type="button"
                          onClick={() => setBlockingId(null)}
                          disabled={action.pending}
                          className={`tap inline-flex items-center px-2 text-slate-400 underline underline-offset-2 ${busy}`}
                        >
                          Never mind
                        </button>
                      </span>
                    ) : (
                      <div className="flex shrink-0 gap-2">
                        <Link
                          href={`/messages?with=${friend.id}`}
                          className={buttonVariants({ variant: "secondary", size: "sm" })}
                        >
                          Message
                        </Link>
                        <button
                          type="button"
                          onClick={() => setBlockingId(friend.id)}
                          aria-label={`Block ${friend.name ?? friend.username ?? "this person"}`}
                          title="Block"
                          className="tap flex h-9 w-9 items-center justify-center rounded-full text-red-400 transition hover:text-red-300 bg-neu-base shadow-raised-low hover:shadow-raised-mid active:shadow-pressed-low"
                        >
                          <Ban size={18} strokeWidth={1.75} aria-hidden />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          {blocked.length > 0 && (
            <SectionCard title="Blocked">
              <div className="space-y-2">
                {blocked.map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between gap-3 rounded-lg p-2.5 bg-neu-base shadow-raised-low">
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar profile={entry.user} />
                      <ProfileLine profile={entry.user} />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleUnblock(entry.user.id)}
                      disabled={action.pending}
                      className={`tap flex shrink-0 items-center rounded-full px-3 py-1.5 text-small font-medium text-slate-300 transition bg-neu-base shadow-raised-low hover:shadow-raised-mid active:shadow-pressed-low ${busy}`}
                    >
                      {action.isPending(`unblock:${entry.user.id}`) && spin}
                      Unblock
                    </button>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}
        </div>
      }
      detail={
        <div className="space-y-6">
          <SectionCard title="Find people">
            <form onSubmit={handleSearch} className="flex gap-2">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search @username"
                className="flex-1 glass-surface-subtle px-3 py-2 text-body text-slate-100 outline-none transition focus:border-slate-50/60"
              />
              <button
                type="submit"
                disabled={action.pending || query.trim().length < 2}
                className={buttonVariants({ variant: "primary" })}
              >
                {searching && spin}
                {searching ? "Searching…" : "Search"}
              </button>
            </form>

            {(requestError ?? action.error) && <p className="mt-2 text-small text-red-400">{requestError ?? action.error}</p>}

            {results.length > 0 && (
              <div className="mt-4 space-y-2">
                {results.map((profile) => (
                  <div key={profile.id} className="flex items-center justify-between gap-3 rounded-lg p-2.5 bg-neu-base shadow-raised-low">
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar profile={profile} />
                      <ProfileLine profile={profile} />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAddFriend(profile)}
                      disabled={sentTo.has(profile.id) || action.pending}
                      className={buttonVariants({ variant: "secondary", size: "sm", className: "shrink-0" })}
                    >
                      {action.isPending(`add:${profile.id}`) && spin}
                      {sentTo.has(profile.id) ? "Sent" : "Add friend"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          {receivedRequests.length > 0 && (
            <SectionCard id="requests" title="Friend requests">
              <div className="space-y-2">
                {receivedRequests.map((req) => (
                  <div key={req.id} className="flex items-center justify-between gap-3 rounded-lg p-2.5 bg-neu-base shadow-raised-low">
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar profile={req.sender} />
                      <ProfileLine profile={req.sender} />
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        onClick={() => handleRespond(req.id, true)}
                        disabled={action.pending}
                        className={buttonVariants({ variant: "primary", size: "sm", className: busy })}
                      >
                        {action.isPending(`accept:${req.id}`) && spin}
                        Accept
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRespond(req.id, false)}
                        disabled={action.pending}
                        className={`tap flex items-center rounded-full px-3 py-1.5 text-small font-medium text-slate-400 transition bg-neu-base shadow-raised-low hover:shadow-raised-mid active:shadow-pressed-low ${busy}`}
                      >
                        {action.isPending(`reject:${req.id}`) && spin}
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {sentRequests.length > 0 && (
            <SectionCard title="Sent requests">
              <div className="space-y-2">
                {sentRequests.map((req) => (
                  <div key={req.id} className="flex items-center justify-between gap-3 rounded-lg p-2.5 bg-neu-base shadow-raised-low">
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar profile={req.receiver} />
                      <ProfileLine profile={req.receiver} />
                    </div>
                    <span className="shrink-0 text-small text-slate-500">Pending</span>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}
        </div>
      }
    />
  );
}
