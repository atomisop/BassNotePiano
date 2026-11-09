// The admin menu's shape: six hubs, each holding the related pages as tabs. Pure, so it is tested without a browser.
//
// Seventeen pages used to be seventeen choices. Related ones now sit together (Billing holds Payments, Payment Plans and Pricing, and
// so on), so the menu is six items and the rest are one tap away inside the page. Every page keeps its own address, so a link in an
// email or a notification still opens exactly where it did.

export type AdminHubId = "overview" | "billing" | "people" | "classes" | "inbox" | "setup";

export interface AdminPage {
  href: string;
  /** The tab's name; it is also the page's own heading. Kept to one short word so a hub's tabs fit across a 320px phone (four,
      or five when one of them is as short as "Data"). */
  label: string;
  /** A page used now and then: it sits under the section's "More" tab instead of being a tab of its own. Still a page with its own
      address, still found by `locateAdminPage`, still counted by `hubWaiting`. */
  more?: boolean;
}

export interface AdminHub {
  id: AdminHubId;
  label: string;
  pages: AdminPage[];
}

export const ADMIN_HUBS: AdminHub[] = [
  { id: "overview", label: "Overview", pages: [{ href: "/admin", label: "Overview" }] },
  {
    id: "billing",
    label: "Billing",
    pages: [
      { href: "/admin/payments", label: "Payments" },
      { href: "/admin/payment-plans", label: "Plans" },
      { href: "/admin/pricing", label: "Pricing", more: true },
      { href: "/admin/money-check", label: "Check", more: true },
    ],
  },
  {
    id: "people",
    label: "People",
    pages: [
      { href: "/admin/users", label: "Accounts" },
      // Class applications were removed (2026-11-09): what the class form sends is listed here.
      { href: "/admin/contacts", label: "Contacts" },
      { href: "/admin/scholarships", label: "Scholarships" },
      { href: "/admin/employees", label: "Staff", more: true },
    ],
  },
  {
    id: "classes",
    label: "Classes",
    pages: [
      { href: "/admin/today", label: "Today" },
      { href: "/admin/schedule", label: "Schedule" },
      { href: "/admin/lessons", label: "Lessons" },
      { href: "/admin/discord", label: "Discord", more: true },
    ],
  },
  {
    id: "inbox",
    label: "Inbox",
    pages: [
      { href: "/admin/support", label: "Support Chat" },
      { href: "/admin/messages", label: "Messages" },
      { href: "/admin/sent", label: "Sent", more: true },
    ],
  },
  {
    id: "setup",
    label: "Setup",
    pages: [
      { href: "/admin/settings", label: "Settings" },
      { href: "/admin/security", label: "System" },
      { href: "/admin/activity", label: "Activity", more: true },
      { href: "/admin/roadmaps", label: "Roadmaps", more: true },
      { href: "/admin/data", label: "Data", more: true },
    ],
  },
];

/** What is waiting, by page address. Pages with nothing waiting have no entry. */
export type AdminNavBadges = Record<string, number>;

function matches(href: string, pathname: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The hub and page an address belongs to (a student's own page counts as Accounts), or null for an address that is in no hub. */
export function locateAdminPage(pathname: string): { hub: AdminHub; page: AdminPage } | null {
  let best: { hub: AdminHub; page: AdminPage } | null = null;
  for (const hub of ADMIN_HUBS) {
    for (const page of hub.pages) {
      if (!matches(page.href, pathname)) continue;
      // The longest address wins, so /admin/payment-plans is never read as /admin/payments.
      if (!best || page.href.length > best.page.href.length) best = { hub, page };
    }
  }
  return best;
}

/** Everything waiting inside a hub, for the number on its tile. */
export function hubWaiting(hub: AdminHub, badges: AdminNavBadges): number {
  return hub.pages.reduce((sum, page) => sum + Math.max(0, badges[page.href] ?? 0), 0);
}

/** Every page, once: a hub's pages are the menu's whole content, so nothing can be missing or listed twice. */
export function allAdminPages(): AdminPage[] {
  return ADMIN_HUBS.flatMap((hub) => hub.pages);
}

/** The tabs a section shows, and the pages tucked under "More". A section whose pages are all everyday ones has no More. */
export function splitHubPages(hub: AdminHub): { tabs: AdminPage[]; more: AdminPage[] } {
  return { tabs: hub.pages.filter((p) => !p.more), more: hub.pages.filter((p) => p.more) };
}
