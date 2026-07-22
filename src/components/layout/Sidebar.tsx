"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

export interface SidebarProps {
  name?: string | null;
  email?: string | null;
  isProMember: boolean;
  isAdmin: boolean;
}

const NAV_ITEMS = [
  { href: "/dashboard", label: "Roadmap" },
  { href: "/billing/history", label: "Payment history" },
  { href: "/pricing", label: "Pricing" },
];

export function Sidebar({ name, email, isProMember, isAdmin }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col border-r border-neutral-900 bg-neutral-950/80 px-4 py-6">
      <Link href="/" className="px-2 font-serif text-sm tracking-[0.2em] text-neutral-200">
        KIÑIT <span className="text-amber-400">ACADEMY</span>
      </Link>

      <nav className="mt-8 flex flex-1 flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-lg px-3 py-2 text-sm transition ${
                active
                  ? "bg-amber-400/10 text-amber-300"
                  : "text-neutral-400 hover:bg-neutral-900 hover:text-neutral-100"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
        {isAdmin && (
          <Link
            href="/admin/payments"
            className={`rounded-lg px-3 py-2 text-sm transition ${
              pathname.startsWith("/admin")
                ? "bg-amber-400/10 text-amber-300"
                : "text-neutral-400 hover:bg-neutral-900 hover:text-neutral-100"
            }`}
          >
            Admin
          </Link>
        )}
      </nav>

      <div className="mt-auto border-t border-neutral-900 pt-4">
        <p className="truncate px-2 text-sm text-neutral-200">{name ?? email ?? "Student"}</p>
        <p className="mt-0.5 px-2 text-xs text-neutral-500">
          {isProMember ? "Pro · Lifetime access" : "Pay-As-You-Go"}
        </p>
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/" })}
          className="mt-3 w-full rounded-lg border border-neutral-800 px-3 py-1.5 text-left text-xs font-medium text-neutral-400 transition hover:border-neutral-700 hover:text-neutral-100"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
