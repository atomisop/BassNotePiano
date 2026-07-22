import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { AdminNav } from "@/components/admin/AdminNav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/admin");
  if (session.user.role !== "ADMIN") redirect("/dashboard");

  return (
    <div className="min-h-screen bg-neutral-950">
      <header className="border-b border-neutral-900 px-6 py-4">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4">
          <Link href="/" className="font-serif text-sm tracking-[0.2em] text-neutral-200">
            BASS NOTE <span className="text-amber-400">PIANO</span>
            <span className="ml-2 text-neutral-600">· Admin</span>
          </Link>
          <div className="flex items-center gap-4">
            <AdminNav />
            <Link href="/dashboard" className="text-sm text-neutral-500 transition hover:text-neutral-100">
              Back to app
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-10">{children}</main>
    </div>
  );
}
