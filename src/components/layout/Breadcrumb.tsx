"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "@/components/ui/appIcons";
import { locateAdminPage } from "@/lib/adminNav";

// Where you are, in the top bar of a wide screen: "Bass Note Piano > Lessons". Names come from this one list; an address
// not in it shows its own words with the first letter capitalized, and ids in an address (long random strings) are skipped.
const SECTION_NAMES: Record<string, string> = {
  dashboard: "Home",
  practice: "Practice",
  lessons: "Online lessons",
  friends: "Friends",
  messages: "Messages",
  account: "Settings",
  profile: "Profile",
  billing: "Billing",
  parent: "Parent mode",
  about: "About",
  scales: "Scales",
  admin: "Admin",
};

function nameOf(segment: string): string {
  return SECTION_NAMES[segment] ?? segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, " ");
}

function isId(segment: string): boolean {
  return segment.length > 16 && /^[a-z0-9]+$/i.test(segment);
}

export function crumbsFor(pathname: string): { label: string; href: string }[] {
  const parts = pathname.split("/").filter(Boolean).filter((p) => !isId(p));
  if (parts.length === 0) return [];
  if (parts[0] === "admin") {
    const located = locateAdminPage(pathname);
    const crumbs = [{ label: "Admin", href: "/admin" }];
    if (located && located.hub.id !== "overview") crumbs.push({ label: located.hub.label, href: located.hub.pages[0].href });
    if (located && located.page.href !== "/admin" && located.page.label !== located.hub.label) crumbs.push({ label: located.page.label, href: located.page.href });
    return crumbs;
  }
  let href = "";
  return parts.slice(0, 3).map((segment) => {
    href += `/${segment}`;
    return { label: nameOf(segment), href };
  });
}

export function Breadcrumb() {
  const pathname = usePathname();
  const crumbs = crumbsFor(pathname);
  if (crumbs.length === 0) return null;
  return (
    <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1.5 text-small text-slate-400 lg:flex">
      <Link href="/dashboard" className="shrink-0 hover:text-slate-100">
        Bass Note Piano
      </Link>
      {crumbs.map((crumb, i) => {
        const last = i === crumbs.length - 1;
        return (
          <span key={crumb.href} className="flex min-w-0 items-center gap-1.5">
            <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden />
            {last ? (
              <span aria-current="page" className="truncate font-medium text-slate-50">
                {crumb.label}
              </span>
            ) : (
              <Link href={crumb.href} className="truncate hover:text-slate-100">
                {crumb.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
