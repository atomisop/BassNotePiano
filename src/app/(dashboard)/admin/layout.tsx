import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { AdminPhoneMenu, AdminSectionTabs, AdminSideRail } from "@/components/admin/AdminNav";
import { getAdminNavBadges } from "@/lib/admin";
import { WideLayout } from "@/components/layout/PageLayouts";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/admin");
  if (session.user.role !== "ADMIN") redirect("/dashboard");

  const badges = await getAdminNavBadges().catch(() => ({}));

  return (
    <WideLayout className="md:flex md:items-start md:gap-6">
      <AdminSideRail badges={badges} />
      <div className="min-w-0 flex-1">
        {/* The menu stays put on every admin screen and only the page under it scrolls (owner, 2026-10-31): the phone's section bar
            and the section's tabs pin together as one heading, then the page's content starts right under them, with no title. */}
        <div data-deck-header data-bar-continues="" className="deck-header -mt-4 pt-4">
          <AdminPhoneMenu badges={badges} />
          <AdminSectionTabs badges={badges} />
        </div>
        <div data-admin-page>{children}</div>
      </div>
    </WideLayout>
  );
}
