"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/payments", label: "Payments" },
  { href: "/admin/bookings", label: "Bookings" },
  { href: "/admin/students", label: "Students" },
  { href: "/admin/lessons", label: "Lessons" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/credits", label: "Credits" },
  { href: "/admin/messages", label: "Messages" },
  { href: "/admin/announcements", label: "Announcements" },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1.5 overflow-x-auto rounded-full border border-white/10 p-1">
      {NAV_ITEMS.map((item) => {
        const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition ${
              active ? "bg-amber-400 text-slate-950" : "text-slate-400 hover:text-slate-100"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
