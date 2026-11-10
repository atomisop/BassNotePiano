"use client";

import { useState, type CSSProperties, type FormEvent } from "react";
import { Avatar as UiAvatar } from "@/components/ui/Avatar";
import Link from "next/link";
import { Ban, ChevronDown } from "@/components/ui/appIcons";
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
import { NudgeButton } from "@/components/social/NudgeButton";
import { nudgeSenderLabel } from "@/lib/nudgeRules";
import { FriendDetail } from "./FriendDetail";
import { toast } from "@/components/ui/Toaster";

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

/** A person in a row: the name is what you read, the @username a quiet line under it. */
function ProfileLine({ profile }: { profile: PublicProfile }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-body font-medium text-slate-50">{profile.name ?? "Unnamed"}</p>
      {profile.username && <p className="truncate text-small text-slate-500">@{profile.username}</p>}
    </div>
  );
}

function SectionCard({
  title,
  count,
  children,
  id,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <div id={id} className="glass-surface scroll-mt-24 p-4 md:p-6">
      <h2 className="flex items-baseline gap-2 text-title font-semibold text-slate-50">
        {title}
        {count ? <span className="text-small font-normal tabular-nums text-slate-500">{count}</span> : null}
      </h2>
      <div className="mt-3">{children}</div>
    </div>
  );
}

/** People as rows with hairlines between them (DESIGN.md, Hierarchy rule 8), not a pile of equal boxes. */
const ROWS = "-my-1 divide-y divide-slate-50/8";
const ROW = "flex items-center justify-between gap-3 py-2.5";

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
  // The friend whose practice panel is open (one at a time).
  const [openId, setOpenId] = useState<string | null>(null);

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
    if (!accept && !(await toast.hold("Declining the request"))) return;
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
        <div data-deck-header className="deck-header -mt-4 pt-4">
          <p className="text-small font-medium uppercase tracking-caps text-slate-400">Social</p>
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
        <div data-deck-header className="deck-header -mt-4 pt-4">
          <p className="text-small font-medium uppercase tracking-caps text-slate-400">Social</p>
          <h1 className="font-hero text-hero font-bold text-balance mt-1.5 text-slate-50">Friends</h1>
          <p className="mt-1 text-small text-slate-500">
            You&apos;re <span className="text-slate-300">@{username}</span>.
          </p>
        </div>
      }
      list={
        <div className="space-y-6">
          {/* Requests first: they are the one thing here waiting on you. */}
          {receivedRequests.length > 0 && (
            <SectionCard id="requests" title="Friend requests" count={receivedRequests.length}>
              <ul className={ROWS}>
                {receivedRequests.map((req, i) => (
                  <li key={req.id} style={{ "--i": i } as CSSProperties} className={`stagger-item ${ROW}`}>
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar profile={req.sender} />
                      <ProfileLine profile={req.sender} />
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleRespond(req.id, false)}
                        disabled={action.pending}
                        className={buttonVariants({ variant: "ghost", size: "sm", className: `text-slate-400 ${busy}` })}
                      >
                        {action.isPending(`reject:${req.id}`) && spin}
                        Reject
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRespond(req.id, true)}
                        disabled={action.pending}
                        className={buttonVariants({ variant: "secondary", size: "sm", className: busy })}
                      >
                        {action.isPending(`accept:${req.id}`) && spin}
                        Accept
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}

          <SectionCard title="Friends" count={friends.length}>
            {friends.length === 0 ? (
              <div className="flex flex-col items-center gap-1 py-6 text-center">
                <p className="text-body font-semibold text-slate-100">No friends yet</p>
              </div>
            ) : (
              <ul className={ROWS}>
                {friends.map((friend, i) => {
                  const open = openId === friend.id;
                  const label = friend.name ?? friend.username ?? "them";
                  return (
                    <li key={friend.id} style={{ "--i": i } as CSSProperties} className="stagger-item">
                      <div className={ROW}>
                        {/* The name opens that friend's practice, badges and streak right here: one place for looking and nudging. */}
                        <button
                          type="button"
                          onClick={() => {
                            setOpenId(open ? null : friend.id);
                            if (open) setBlockingId(null);
                          }}
                          aria-expanded={open}
                          aria-label={`${open ? "Hide" : "Show"} ${friend.name ?? friend.username ?? "friend"}'s practice`}
                          className="tap group flex min-w-0 flex-1 items-center gap-3 rounded-control text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <Avatar profile={friend} />
                          <ProfileLine profile={friend} />
                          <ChevronDown size={16} strokeWidth={1.75} aria-hidden className={`shrink-0 text-slate-500 transition-transform group-hover:text-slate-300 ${open ? "rotate-180" : ""}`} />
                        </button>
                        {/* The one everyday action stays on the row; blocking lives inside the opened row, quiet and behind a confirm. */}
                        <NudgeButton friendId={friend.id} friendName={nudgeSenderLabel(friend.name ?? friend.username)} />
                      </div>
                      {open && (
                        <div className="mb-3 rounded-control bg-slate-50/4 p-3 ring-1 ring-inset ring-slate-50/8">
                          {friend.username && <FriendDetail username={friend.username} />}
                          <div className={`flex flex-wrap items-center gap-x-3 gap-y-2 ${friend.username ? "mt-3 border-t border-slate-50/8 pt-2" : ""}`}>
                            {blockingId === friend.id ? (
                              <>
                                <span className="text-small text-red-300">Block {label}?</span>
                                <span className="ml-auto flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => setBlockingId(null)}
                                    disabled={action.pending}
                                    className={buttonVariants({ variant: "ghost", size: "sm", className: busy })}
                                  >
                                    Never mind
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleBlock(friend.id)}
                                    disabled={action.pending}
                                    className={buttonVariants({ variant: "danger", size: "sm", className: busy })}
                                  >
                                    {action.isPending(`block:${friend.id}`) && spin}
                                    Confirm
                                  </button>
                                </span>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setBlockingId(friend.id)}
                                aria-label={`Block ${friend.name ?? friend.username ?? "this person"}`}
                                className={buttonVariants({ variant: "ghost", size: "sm", className: "-ml-2 text-red-300 hover:text-red-200" })}
                              >
                                <Ban size={16} strokeWidth={1.75} aria-hidden />
                                Block
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </SectionCard>

          {blocked.length > 0 && (
            <SectionCard title="Blocked" count={blocked.length}>
              <ul className={ROWS}>
                {blocked.map((entry) => (
                  <li key={entry.id} className={ROW}>
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar profile={entry.user} />
                      <ProfileLine profile={entry.user} />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleUnblock(entry.user.id)}
                      disabled={action.pending}
                      className={buttonVariants({ variant: "ghost", size: "sm", className: `shrink-0 ${busy}` })}
                    >
                      {action.isPending(`unblock:${entry.user.id}`) && spin}
                      Unblock
                    </button>
                  </li>
                ))}
              </ul>
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
                className="min-w-0 flex-1 glass-surface-subtle px-3 py-2 text-body text-slate-100 outline-none transition focus:border-slate-50/60"
              />
              <button
                type="submit"
                disabled={action.pending || query.trim().length < 2}
                className={buttonVariants({ variant: "primary", className: "shrink-0 whitespace-nowrap" })}
              >
                {searching && spin}
                {searching ? "Searching…" : "Search"}
              </button>
            </form>

            {(requestError ?? action.error) && <p className="mt-2 text-small text-red-400">{requestError ?? action.error}</p>}

            {results.length > 0 && (
              <ul className={`mt-3 ${ROWS}`}>
                {results.map((profile) => (
                  <li key={profile.id} className={ROW}>
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
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          {sentRequests.length > 0 && (
            <SectionCard title="Sent requests" count={sentRequests.length}>
              <ul className={ROWS}>
                {sentRequests.map((req) => (
                  <li key={req.id} className={ROW}>
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar profile={req.receiver} />
                      <ProfileLine profile={req.receiver} />
                    </div>
                    <span className="shrink-0 text-small text-slate-500">Pending</span>
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}
        </div>
      }
    />
  );
}
