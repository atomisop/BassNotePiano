import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { AdminNav } from "@/components/admin/AdminNav";
import { getAdminNavBadges } from "@/lib/admin";
import { WideLayout } from "@/components/layout/PageLayouts";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/admin");
  if (session.user.role !== "ADMIN") redirect("/dashboard");

  const badges = await getAdminNavBadges().catch(() => ({}));

  return (
    <WideLayout>
      <AdminNav badges={badges} />
      <div className="mt-8">{children}</div>
    </WideLayout>
  );
}
