import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { getConversations } from "@/lib/messages";
import { AdminMessagesClient } from "./AdminMessagesClient";

export default async function AdminMessagesPage() {
  const session = await getServerAuthSession();
  // The (dashboard)/admin/layout.tsx above this route already redirects
  // non-admins away, but getConversations' behavior genuinely depends on
  // the caller being an admin (see getAdminThreadPartners in lib/messages),
  // so this guard stays explicit rather than assumed from the layout.
  if (!session?.user || session.user.role !== "ADMIN") redirect("/login?callbackUrl=/admin/messages");

  const conversations = await getConversations(session.user.id);

  return <AdminMessagesClient initialConversations={conversations} />;
}
