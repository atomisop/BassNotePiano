import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { AdminNav, AdminSectionTabs } from "@/components/admin/AdminNav";
import { getAdminNavBadges } from "@/lib/admin";
import { WideLayout } from "@/components/layout/PageLayouts";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/admin");
  if (session.user.role !== "ADMIN") redirect("/dashboard");

  const badges = await getAdminNavBadges().catch(() => ({}));

  return (
    <WideLayout className="md:flex md:items-start md:gap-6">
      <AdminNav badges={badges} />
      <div className="min-w-0 flex-1">
        <AdminSectionTabs badges={badges} />
        {children}
      </div>
    </WideLayout>
  );
}
