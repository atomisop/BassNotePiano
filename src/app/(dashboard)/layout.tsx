import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTotalUnreadMessageCount } from "@/lib/messages";
import { LATEST_ENTRY } from "@/lib/changelog";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { WhatsNewModal } from "@/components/layout/WhatsNewModal";

function isSameUtcDay(a: Date, b: Date): boolean {
  return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth() && a.getUTCDate() === b.getUTCDate();
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/dashboard");

  const [unreadMessageCount, user] = await Promise.all([
    getTotalUnreadMessageCount(session.user.id),
    prisma.user.findUnique({ where: { id: session.user.id }, select: { lastSeenPatchNotesAt: true } }),
  ]);

  const shouldShowWhatsNew = !user?.lastSeenPatchNotesAt || !isSameUtcDay(user.lastSeenPatchNotesAt, new Date());

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
      <WhatsNewModal show={shouldShowWhatsNew} entry={LATEST_ENTRY} />
    </div>
  );
}
