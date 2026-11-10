import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getFriendsList, getPendingRequestsReceived, getPendingRequestsSent, getBlockedUsers, getEmailAsksSent } from "@/lib/social";
import { FriendsClient } from "./FriendsClient";

export const metadata = { title: "Friends" };

export default async function FriendsPage() {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/friends");

  const [user, friends, received, sent, blocked, emailAsks] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: session.user.id }, select: { username: true } }),
    getFriendsList(session.user.id),
    getPendingRequestsReceived(session.user.id),
    getPendingRequestsSent(session.user.id),
    getBlockedUsers(session.user.id),
    getEmailAsksSent(session.user.id),
  ]);

  return (
    <FriendsClient
      username={user.username}
      friends={friends}
      receivedRequests={received.map((r) => ({ id: r.id, sender: r.sender }))}
      sentRequests={sent.map((r) => ({ id: r.id, receiver: r.receiver }))}
      emailAsks={emailAsks.map((a) => ({ id: a.id, email: a.email }))}
      blocked={blocked.map((b) => ({ id: b.id, user: b.blocked }))}
    />
  );
}
