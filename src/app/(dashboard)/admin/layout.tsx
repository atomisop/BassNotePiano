import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { AdminNav } from "@/components/admin/AdminNav";
import { WideLayout } from "@/components/layout/PageLayouts";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/admin");
  if (session.user.role !== "ADMIN") redirect("/dashboard");

  return (
    <WideLayout>
      <AdminNav />
      <div className="mt-8">{children}</div>
    </WideLayout>
  );
}
