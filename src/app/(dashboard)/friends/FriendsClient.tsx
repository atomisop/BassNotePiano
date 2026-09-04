"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MorphingSquare } from "@/components/ui/morphing-square";
import {
  searchUsersAction,
  sendFriendRequestAction,
  respondToFriendRequestAction,
  blockUserAction,
  unblockUserAction,
} from "./actions";

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
    <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full border border-ink/10 bg-slate-800">
      {profile.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={profile.image} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-xs text-slate-500">
          {(profile.name ?? profile.username ?? "?").charAt(0).toUpperCase()}
        </div>
      )}
    </div>
  );
}

function ProfileLine({ profile }: { profile: PublicProfile }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-sm text-slate-100">{profile.name ?? "Unnamed"}</p>
      {profile.username && <p className="truncate text-xs text-slate-500">@{profile.username}</p>}
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
      <h2 className="font-serif text-lg text-slate-50">{title}</h2>
      {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}

export function FriendsClient({ username, friends, receivedRequests, sentRequests, blocked }: FriendsClientProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PublicProfile[]>([]);
  const [searching, setSearching] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<Set<string>>(new Set());
  // Block used to fire on a single click. Unlike Reject (turning down a
  // stranger's incoming request, low-stakes either way), this ends an
  // existing friendship, so it gets the same one-more-click safety net as
  // every other hard-to-walk-back admin/account action in the app.
  const [blockingId, setBlockingId] = useState<string | null>(null);

  async function handleSearch(e: FormEvent) {
    e.preventDefault();
    setSearching(true);
    setRequestError(null);
    const found = await searchUsersAction(query);
    setResults(found);
    setSearching(false);
  }

  async function handleAddFriend(profile: PublicProfile) {
    if (!profile.username) return;
    setRequestError(null);
    const result = await sendFriendRequestAction(profile.username);
    if (!result.ok) {
      setRequestError(result.error);
      return;
    }
    setSentTo((prev) => new Set(prev).add(profile.id));
    router.refresh();
  }

  async function handleRespond(requestId: string, accept: boolean) {
    await respondToFriendRequestAction(requestId, accept);
    router.refresh();
  }

  async function handleBlock(userId: string) {
    await blockUserAction(userId);
    setBlockingId(null);
    router.refresh();
  }

  async function handleUnblock(userId: string) {
    await unblockUserAction(userId);
    router.refresh();
  }

  if (!username) {
    return (
      <div className="mx-auto max-w-xl space-y-6">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-a-400)/0.8)]">Social</p>
          <h1 className="mt-1.5 font-serif text-2xl text-slate-50">Friends</h1>
        </div>
        <SectionCard title="Set a username first" description="Needed so other students can find and add you.">
          <Link
            href="/profile"
            className="cta-sheen cta-fill inline-block rounded-lg px-4 py-2 text-xs font-semibold"
          >
            Go to your profile
          </Link>
        </SectionCard>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-a-400)/0.8)]">Social</p>
        <h1 className="mt-1.5 font-serif text-2xl text-slate-50">Friends</h1>
        <p className="mt-1 text-sm text-slate-500">
          You&apos;re <span className="text-slate-300">@{username}</span>.
        </p>
      </div>

      <SectionCard title="Find people" description="Search by username.">
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search @username"
            className="flex-1 glass-surface-subtle px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-[rgb(var(--c-a-400)/0.6)]"
          />
          <button
            type="submit"
            disabled={searching || query.trim().length < 2}
            className="cta-sheen cta-fill flex items-center justify-center rounded-lg px-4 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-60"
          >
            {searching && <MorphingSquare size={12} className="mr-1.5 shrink-0" />}
            {searching ? "Searching…" : "Search"}
          </button>
        </form>

        {requestError && <p className="mt-2 text-xs text-red-400">{requestError}</p>}

        {results.length > 0 && (
          <div className="mt-4 space-y-2">
            {results.map((profile) => (
              <div key={profile.id} className="flex items-center justify-between gap-3 rounded-lg border border-ink/10 p-2.5">
                <div className="flex items-center gap-3">
                  <Avatar profile={profile} />
                  <ProfileLine profile={profile} />
                </div>
                <button
                  type="button"
                  onClick={() => handleAddFriend(profile)}
                  disabled={sentTo.has(profile.id)}
                  className="shrink-0 rounded-lg border border-ink/10 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-[rgb(var(--c-a-400)/0.5)] hover:text-[rgb(var(--c-a-300))] disabled:cursor-not-allowed disabled:opacity-50"
                >
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
              <div key={req.id} className="flex items-center justify-between gap-3 rounded-lg border border-ink/10 p-2.5">
                <div className="flex items-center gap-3">
                  <Avatar profile={req.sender} />
                  <ProfileLine profile={req.sender} />
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => handleRespond(req.id, true)}
                    className="cta-sheen cta-fill rounded-lg px-3 py-1.5 text-xs font-semibold"
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRespond(req.id, false)}
                    className="rounded-lg border border-ink/10 px-3 py-1.5 text-xs font-medium text-slate-400 transition hover:border-slate-600"
                  >
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
              <div key={req.id} className="flex items-center justify-between gap-3 rounded-lg border border-ink/10 p-2.5">
                <div className="flex items-center gap-3">
                  <Avatar profile={req.receiver} />
                  <ProfileLine profile={req.receiver} />
                </div>
                <span className="shrink-0 text-xs text-slate-500">Pending</span>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      <SectionCard title={`Friends (${friends.length})`}>
        {friends.length === 0 ? (
          <p className="text-xs text-slate-500">No friends yet — search above to find people.</p>
        ) : (
          <div className="space-y-2">
            {friends.map((friend) => (
              <div key={friend.id} className="flex items-center justify-between gap-3 rounded-lg border border-ink/10 p-2.5">
                <div className="flex items-center gap-3">
                  <Avatar profile={friend} />
                  <ProfileLine profile={friend} />
                </div>
                {blockingId === friend.id ? (
                  <span className="flex shrink-0 items-center gap-2 rounded-lg border border-red-900 bg-red-400/5 px-3 py-1.5 text-xs text-red-300">
                    Block {friend.name ?? friend.username ?? "them"}?
                    <button type="button" onClick={() => handleBlock(friend.id)} className="font-semibold underline underline-offset-2">
                      Confirm
                    </button>
                    <button type="button" onClick={() => setBlockingId(null)} className="text-slate-400 underline underline-offset-2">
                      Never mind
                    </button>
                  </span>
                ) : (
                  <div className="flex shrink-0 gap-2">
                    <Link
                      href={`/messages?with=${friend.id}`}
                      className="rounded-lg border border-ink/10 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-[rgb(var(--c-a-400)/0.5)] hover:text-[rgb(var(--c-a-300))]"
                    >
                      Message
                    </Link>
                    <button
                      type="button"
                      onClick={() => setBlockingId(friend.id)}
                      className="rounded-lg border border-ink/10 px-3 py-1.5 text-xs font-medium text-slate-500 transition hover:border-red-900 hover:text-red-400"
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
              <div key={entry.id} className="flex items-center justify-between gap-3 rounded-lg border border-ink/10 p-2.5">
                <div className="flex items-center gap-3">
                  <Avatar profile={entry.user} />
                  <ProfileLine profile={entry.user} />
                </div>
                <button
                  type="button"
                  onClick={() => handleUnblock(entry.user.id)}
                  className="shrink-0 rounded-lg border border-ink/10 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-slate-600"
                >
                  Unblock
                </button>
              </div>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}
