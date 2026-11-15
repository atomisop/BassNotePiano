"use client";

import { useState, type CSSProperties, type FormEvent } from "react";
import { Avatar as UiAvatar } from "@/components/ui/Avatar";
import Link from "next/link";
import { Ban, ChevronDown, Flame, Mail, Trophy, User, UserPlus } from "@/components/ui/appIcons";
import { useRouter } from "next/navigation";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { useAction } from "@/hooks/useAction";
import {
  searchUsersAction,
  sendFriendRequestAction,
  respondToFriendRequestAction,
  withdrawEmailAskAction,
  blockUserAction,
  unblockUserAction,
} from "./actions";
import { WideLayout } from "@/components/layout/PageLayouts";
import { HeroBand } from "@/components/ui/HeroBand";
import { ActionTiles } from "@/components/ui/ActionTiles";
import { Meta } from "@/components/ui/CardKit";
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
  /** "Ask to book together" by email: shown as the typed email only, whether or not it has an account. */
  emailAsks: { id: string; email: string }[];
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

/** A quiet card under the band: a small heading naming the list, its count beside it, the rows below. */
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
    <section id={id} aria-label={title} className="scroll-mt-24 rounded-card bg-neu-base p-5 shadow-raised-low sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-small font-semibold uppercase tracking-caps text-slate-400">{title}</h2>
        {count ? <span className="min-w-7 rounded-full bg-slate-50/8 px-2 py-0.5 text-center text-small font-semibold tabular-nums text-slate-100">{count}</span> : null}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** The page's pinned title. The band under it carries the rest (who you are, what is waiting). */
function Heading() {
  return (
    <div data-deck-header className="deck-header -mt-4 pt-4">
      <h1 className="font-hero text-hero font-bold text-balance text-slate-50">Friends</h1>
    </div>
  );
}

/** People as rows with hairlines between them (DESIGN.md, Hierarchy rule 8), not a pile of equal boxes. */
const ROWS = "-my-1 divide-y divide-slate-50/8";
const ROW = "flex items-center justify-between gap-3 py-2.5";

export function FriendsClient({ username, friends: allFriends, receivedRequests: allReceived, sentRequests, emailAsks: allEmailAsks, blocked: allBlocked }: FriendsClientProps) {
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
  const emailAsks = allEmailAsks.filter((a) => !gone.has(`ask:${a.id}`));
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
        const result = await respondToFriendRequestAction(requestId, accept);
        if (result.ok && "waitingForParent" in result && result.waitingForParent) toast.success("Sent to a parent to approve. It starts once they say yes.");
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

  async function handleWithdraw(askId: string) {
    if (!(await toast.hold("Withdrawing the ask"))) return;
    hide(`ask:${askId}`);
    const result = await withdrawEmailAskAction(askId).catch(() => ({ ok: false as const, error: "Something went wrong." }));
    if (!result.ok) {
      unhide(`ask:${askId}`);
      toast.warning(result.error);
      return;
    }
    router.refresh();
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
        <Heading />
        <HeroBand eyebrow="Before you add friends" title="Set a username first" meta="Friends find you by your username.">
          <div className="pt-3">
            <Link href="/profile" className={buttonVariants({ variant: "primary", size: "sm", className: "inline-block" })}>
              Go to your profile
            </Link>
          </div>
        </HeroBand>
      </WideLayout>
    );
  }

  // The one fact: requests waiting on you; with none, how many friends you have.
  const waiting = receivedRequests.length;
  const sentCount = sentRequests.length + emailAsks.length;
  const hasSide = sentCount > 0 || blocked.length > 0;
  const metaItems = [
    waiting > 0 ? `${friends.length} ${friends.length === 1 ? "friend" : "friends"}` : null,
    waiting === 0 && friends.length === 0 ? "Search a username to add your first" : null,
    sentCount > 0 ? `${sentCount} sent, waiting` : null,
  ].filter((item): item is string => item !== null);

  return (
    <WideLayout className="space-y-6">
      <Heading />

      {/* The band: what is waiting (or how many friends), and on its sheet the one thing people come here to do, finding someone. */}
      <HeroBand
        eyebrow={`You're @${username}`}
        title={waiting > 0 ? (waiting === 1 ? "Friend request waiting" : "Friend requests waiting") : friends.length === 0 ? "No friends yet" : friends.length === 1 ? "Friend" : "Friends"}
        figure={waiting > 0 ? waiting : friends.length > 0 ? friends.length : undefined}
        meta={metaItems.length > 0 ? <Meta items={metaItems} /> : undefined}
      >
        <div className="pt-3">
            <form onSubmit={handleSearch} className="flex gap-2">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search @username"
                aria-label="Search by username"
                className="h-11 min-w-0 flex-1 rounded-control bg-neu-base px-3 text-body text-slate-100 shadow-pressed-low outline-none placeholder:text-slate-500 focus-visible:ring-2 focus-visible:ring-ring"
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
        </div>
      </HeroBand>

      <ActionTiles
        title="What do you want to do?"
        items={[
          { href: "/leaderboard", label: "Leaderboard", detail: "Where you stand", icon: <Trophy /> },
          { href: "/streak", label: "Streak", detail: "Your practice days", icon: <Flame /> },
          { href: "/profile", label: "Your profile", detail: "How friends see you", icon: <User /> },
          { href: "/account?tab=account", label: "Invite a friend", detail: "Share your link", icon: <UserPlus /> },
        ]}
      />

      <div className={hasSide ? "grid gap-6 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] md:items-start" : undefined}>
        <div className="min-w-0 space-y-6">
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

          {/* With no friends the band already says so, so there is no empty card. */}
          {friends.length > 0 && (
          <SectionCard title="Friends" count={friends.length}>
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
          </SectionCard>
          )}
        </div>

        {hasSide && (
          <div className="min-w-0 space-y-6">
          {(sentRequests.length > 0 || emailAsks.length > 0) && (
            <SectionCard title="Sent requests" count={sentRequests.length + emailAsks.length}>
              <ul className={ROWS}>
                {/* An "Ask to book together" by email shows only the typed email and "Waiting", whether or not it has an account. */}
                {emailAsks.map((ask) => (
                  <li key={ask.id} className={ROW}>
                    <div className="flex min-w-0 items-center gap-3">
                      <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-50/8 text-slate-400">
                        <Mail className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-body font-medium text-slate-50">{ask.email}</p>
                        <p className="truncate text-small text-slate-500">Asked to book together</p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <span className="text-small text-slate-500">Waiting</span>
                      <button type="button" onClick={() => void handleWithdraw(ask.id)} className={buttonVariants({ variant: "ghost", size: "sm", className: "text-slate-400" })}>
                        Withdraw
                      </button>
                    </div>
                  </li>
                ))}
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
        )}
      </div>
    </WideLayout>
  );
}
