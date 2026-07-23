import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { getTotalUnreadMessageCount } from "@/lib/messages";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/dashboard");

  const unreadMessageCount = await getTotalUnreadMessageCount(session.user.id);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        name={session.user.name}
        isAdmin={session.user.role === "ADMIN"}
        unreadMessageCount={unreadMessageCount}
      />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-y-auto px-8 py-10">{children}</main>
      </div>
    </div>
  );
}
