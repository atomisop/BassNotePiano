"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
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
  return (
    <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-neu-base shadow-raised-low">
      {profile.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={profile.image} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-small text-slate-500">
          {(profile.name ?? profile.username ?? "?").charAt(0).toUpperCase()}
        </div>
      )}
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
      <h2 className="text-body text-slate-50 font-semibold">{title}</h2>
      {description && <p className="mt-1 text-small text-slate-500">{description}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}

export function FriendsClient({ username, friends, receivedRequests, sentRequests, blocked }: FriendsClientProps) {
  const router = useRouter();
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
    await action.run(async () => {
      const result = await sendFriendRequestAction(username);
      if (!result.ok) {
        setRequestError(result.error);
        return;
      }
      setSentTo((prev) => new Set(prev).add(profile.id));
      router.refresh();
    }, `add:${profile.id}`);
  }

  async function handleRespond(requestId: string, accept: boolean) {
    await action.run(async () => {
      await respondToFriendRequestAction(requestId, accept);
      router.refresh();
    }, `${accept ? "accept" : "reject"}:${requestId}`);
  }

  async function handleBlock(userId: string) {
    await action.run(async () => {
      await blockUserAction(userId);
      setBlockingId(null);
      router.refresh();
    }, `block:${userId}`);
  }

  async function handleUnblock(userId: string) {
    await action.run(async () => {
      await unblockUserAction(userId);
      router.refresh();
    }, `unblock:${userId}`);
  }

  if (!username) {
    return (
      <WideLayout className="space-y-6">
        <div>
          <p className="text-small font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50)/0.8)]">Social</p>
          <h1 className="font-hero text-hero font-bold text-balance mt-1.5 text-slate-50">Friends</h1>
        </div>
        <SectionCard title="Set a username first" description="Needed so other students can find and add you.">
          <Link
            href="/profile"
            className="cta-sheen cta-fill inline-block rounded-lg px-4 py-2 text-small font-semibold"
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
          <p className="text-small font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50)/0.8)]">Social</p>
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
              <p className="text-small text-slate-500">No friends yet. Use Find people to add some.</p>
            ) : (
              <div className="space-y-2">
                {friends.map((friend) => (
                  <div key={friend.id} className="flex items-center justify-between gap-3 rounded-lg p-2.5 bg-neu-base shadow-raised-low">
                    <div className="flex items-center gap-3">
                      <Avatar profile={friend} />
                      <ProfileLine profile={friend} />
                    </div>
                    {blockingId === friend.id ? (
                      <span className="flex shrink-0 items-center gap-2 rounded-lg border border-red-900 bg-red-400/5 px-3 py-1.5 text-small text-red-300">
                        Block {friend.name ?? friend.username ?? "them"}?
                        <button
                          type="button"
                          onClick={() => handleBlock(friend.id)}
                          disabled={action.pending}
                          className={`flex items-center font-semibold underline underline-offset-2 ${busy}`}
                        >
                          {action.isPending(`block:${friend.id}`) && spin}
                          Confirm
                        </button>
                        <button
                          type="button"
                          onClick={() => setBlockingId(null)}
                          disabled={action.pending}
                          className={`text-slate-400 underline underline-offset-2 ${busy}`}
                        >
                          Never mind
                        </button>
                      </span>
                    ) : (
                      <div className="flex shrink-0 gap-2">
                        <Link
                          href={`/messages?with=${friend.id}`}
                          className="rounded-lg px-3 py-1.5 text-small font-medium text-slate-300 transition hover:text-[rgb(var(--c-s-50))] bg-neu-base shadow-raised-low hover:shadow-raised-mid active:shadow-pressed-low"
                        >
                          Message
                        </Link>
                        <button
                          type="button"
                          onClick={() => setBlockingId(friend.id)}
                          className="rounded-lg px-3 py-1.5 text-small font-medium text-slate-500 transition hover:text-red-400 bg-neu-base shadow-raised-low hover:shadow-raised-mid active:shadow-pressed-low"
                        >
                          Block
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
                    <div className="flex items-center gap-3">
                      <Avatar profile={entry.user} />
                      <ProfileLine profile={entry.user} />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleUnblock(entry.user.id)}
                      disabled={action.pending}
                      className={`flex shrink-0 items-center rounded-lg px-3 py-1.5 text-small font-medium text-slate-300 transition bg-neu-base shadow-raised-low hover:shadow-raised-mid active:shadow-pressed-low ${busy}`}
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
          <SectionCard title="Find people" description="Search by username.">
            <form onSubmit={handleSearch} className="flex gap-2">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search @username"
                className="flex-1 glass-surface-subtle px-3 py-2 text-body text-slate-100 outline-none transition focus:border-[rgb(var(--c-s-50)/0.6)]"
              />
              <button
                type="submit"
                disabled={action.pending || query.trim().length < 2}
                className="cta-sheen cta-fill flex items-center justify-center rounded-lg px-4 py-2 text-small font-semibold disabled:cursor-not-allowed disabled:opacity-60"
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
                    <div className="flex items-center gap-3">
                      <Avatar profile={profile} />
                      <ProfileLine profile={profile} />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAddFriend(profile)}
                      disabled={sentTo.has(profile.id) || action.pending}
                      className="flex shrink-0 items-center rounded-lg px-3 py-1.5 text-small font-medium text-slate-300 transition hover:text-[rgb(var(--c-s-50))] disabled:cursor-not-allowed disabled:opacity-50 bg-neu-base shadow-raised-low hover:shadow-raised-mid active:shadow-pressed-low"
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
                    <div className="flex items-center gap-3">
                      <Avatar profile={req.sender} />
                      <ProfileLine profile={req.sender} />
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        onClick={() => handleRespond(req.id, true)}
                        disabled={action.pending}
                        className={`cta-sheen cta-fill flex items-center rounded-lg px-3 py-1.5 text-small font-semibold ${busy}`}
                      >
                        {action.isPending(`accept:${req.id}`) && spin}
                        Accept
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRespond(req.id, false)}
                        disabled={action.pending}
                        className={`flex items-center rounded-lg px-3 py-1.5 text-small font-medium text-slate-400 transition bg-neu-base shadow-raised-low hover:shadow-raised-mid active:shadow-pressed-low ${busy}`}
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
                    <div className="flex items-center gap-3">
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
