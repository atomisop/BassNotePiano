import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { Sidebar } from "@/components/layout/Sidebar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/dashboard");

  return (
    <div className="flex min-h-screen bg-neutral-950">
      <Sidebar
        name={session.user.name}
        email={session.user.email}
        isProMember={session.user.isProMember}
        isAdmin={session.user.role === "ADMIN"}
      />
      <main className="flex-1 overflow-y-auto px-8 py-10">{children}</main>
    </div>
  );
}
