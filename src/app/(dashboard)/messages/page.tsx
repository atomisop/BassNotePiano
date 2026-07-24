import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { getConversations } from "@/lib/messages";
import { getGroups } from "@/lib/groupMessages";
import { MessagesClient } from "./MessagesClient";

export default async function MessagesPage() {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/messages");

  const [conversations, groups] = await Promise.all([
    getConversations(session.user.id),
    getGroups(session.user.id),
  ]);

  return <MessagesClient initialConversations={conversations} initialGroups={groups} />;
}
