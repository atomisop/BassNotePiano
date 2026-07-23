"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  setUsernameAction,
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
    <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full border border-neutral-800 bg-neutral-800">
      {profile.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={profile.image} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-xs text-neutral-500">
          {(profile.name ?? profile.username ?? "?").charAt(0).toUpperCase()}
        </div>
      )}
    </div>
  );
}

function ProfileLine({ profile }: { profile: PublicProfile }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-sm text-neutral-100">{profile.name ?? "Unnamed"}</p>
      {profile.username && <p className="truncate text-xs text-neutral-500">@{profile.username}</p>}
    </div>
  );
}

function SectionCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-6">
      <h2 className="font-serif text-lg text-neutral-50">{title}</h2>
      {description && <p className="mt-1 text-sm text-neutral-500">{description}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}

function UsernameGate({ onSet }: { onSet: (username: string) => void }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const result = await setUsernameAction(value);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSet(value.trim().toLowerCase());
  }

  return (
    <SectionCard title="Choose a username" description="Needed so other students can find and add you.">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="flex flex-1 items-center rounded-lg border border-neutral-800 bg-neutral-950 pl-3 focus-within:border-amber-400/60">
          <span className="text-sm text-neutral-500">@</span>
          <input
            type="text"
            required
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="yourname"
            className="w-full bg-transparent px-2 py-2 text-sm text-neutral-100 outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-amber-400 px-4 py-2 text-xs font-semibold text-neutral-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Saving…" : "Save"}
        </button>
      </form>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </SectionCard>
  );
}

export function FriendsClient({ username: initialUsername, friends, receivedRequests, sentRequests, blocked }: FriendsClientProps) {
  const router = useRouter();
  const [username, setUsername] = useState(initialUsername);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PublicProfile[]>([]);
  const [searching, setSearching] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<Set<string>>(new Set());

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
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-400/80">Social</p>
          <h1 className="mt-1.5 font-serif text-2xl text-neutral-50">Friends</h1>
        </div>
        <UsernameGate onSet={setUsername} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-400/80">Social</p>
        <h1 className="mt-1.5 font-serif text-2xl text-neutral-50">Friends</h1>
        <p className="mt-1 text-sm text-neutral-500">
          You're <span className="text-neutral-300">@{username}</span>.
        </p>
      </div>

      <SectionCard title="Find people" description="Search by username.">
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search @username"
            className="flex-1 rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none transition focus:border-amber-400/60"
          />
          <button
            type="submit"
            disabled={searching || query.trim().length < 2}
            className="rounded-lg bg-amber-400 px-4 py-2 text-xs font-semibold text-neutral-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {searching ? "Searching…" : "Search"}
          </button>
        </form>

        {requestError && <p className="mt-2 text-xs text-red-400">{requestError}</p>}

        {results.length > 0 && (
          <div className="mt-4 space-y-2">
            {results.map((profile) => (
              <div key={profile.id} className="flex items-center justify-between gap-3 rounded-lg border border-neutral-800 p-2.5">
                <div className="flex items-center gap-3">
                  <Avatar profile={profile} />
                  <ProfileLine profile={profile} />
                </div>
                <button
                  type="button"
                  onClick={() => handleAddFriend(profile)}
                  disabled={sentTo.has(profile.id)}
                  className="shrink-0 rounded-lg border border-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-300 transition hover:border-amber-400/50 hover:text-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {sentTo.has(profile.id) ? "Sent" : "Add friend"}
                </button>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {receivedRequests.length > 0 && (
        <SectionCard title="Friend requests">
          <div className="space-y-2">
            {receivedRequests.map((req) => (
              <div key={req.id} className="flex items-center justify-between gap-3 rounded-lg border border-neutral-800 p-2.5">
                <div className="flex items-center gap-3">
                  <Avatar profile={req.sender} />
                  <ProfileLine profile={req.sender} />
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => handleRespond(req.id, true)}
                    className="rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-semibold text-neutral-950 transition hover:bg-amber-300"
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRespond(req.id, false)}
                    className="rounded-lg border border-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-400 transition hover:border-neutral-600"
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
              <div key={req.id} className="flex items-center justify-between gap-3 rounded-lg border border-neutral-800 p-2.5">
                <div className="flex items-center gap-3">
                  <Avatar profile={req.receiver} />
                  <ProfileLine profile={req.receiver} />
                </div>
                <span className="shrink-0 text-xs text-neutral-500">Pending</span>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      <SectionCard title={`Friends (${friends.length})`}>
        {friends.length === 0 ? (
          <p className="text-xs text-neutral-500">No friends yet — search above to find people.</p>
        ) : (
          <div className="space-y-2">
            {friends.map((friend) => (
              <div key={friend.id} className="flex items-center justify-between gap-3 rounded-lg border border-neutral-800 p-2.5">
                <div className="flex items-center gap-3">
                  <Avatar profile={friend} />
                  <ProfileLine profile={friend} />
                </div>
                <div className="flex shrink-0 gap-2">
                  <Link
                    href={`/messages?with=${friend.id}`}
                    className="rounded-lg border border-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-300 transition hover:border-amber-400/50 hover:text-amber-300"
                  >
                    Message
                  </Link>
                  <button
                    type="button"
                    onClick={() => handleBlock(friend.id)}
                    className="rounded-lg border border-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-500 transition hover:border-red-900 hover:text-red-400"
                  >
                    Block
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {blocked.length > 0 && (
        <SectionCard title="Blocked">
          <div className="space-y-2">
            {blocked.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between gap-3 rounded-lg border border-neutral-800 p-2.5">
                <div className="flex items-center gap-3">
                  <Avatar profile={entry.user} />
                  <ProfileLine profile={entry.user} />
                </div>
                <button
                  type="button"
                  onClick={() => handleUnblock(entry.user.id)}
                  className="shrink-0 rounded-lg border border-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-300 transition hover:border-neutral-600"
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
