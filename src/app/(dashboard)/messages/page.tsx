import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { getConversations } from "@/lib/messages";
import { getGroups } from "@/lib/groupMessages";
import { getSupportChat } from "@/lib/messagesSupport";
import { MessagesClient } from "./MessagesClient";

export const metadata = { title: "Messages" };

export default async function MessagesPage() {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/messages");

  // The team answers from Admin > Support Chat, so the admin has no Support row of their own.
  const showSupport = session.user.role !== "ADMIN";
  const [conversations, groups, support] = await Promise.all([
    getConversations(session.user.id),
    getGroups(session.user.id),
    showSupport ? getSupportChat(session.user.id) : Promise.resolve(null),
  ]);

  return <MessagesClient initialConversations={conversations} initialGroups={groups} initialSupport={support} />;
}
