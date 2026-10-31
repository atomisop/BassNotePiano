// The admin menu's shape: six hubs, each holding the related pages as tabs. Pure, so it is tested without a browser.
//
// Seventeen pages used to be seventeen choices. Related ones now sit together (Billing holds Payments, Payment Plans and Pricing, and
// so on), so the menu is six items and the rest are one tap away inside the page. Every page keeps its own address, so a link in an
// email or a notification still opens exactly where it did.

export type AdminHubId = "overview" | "billing" | "people" | "classes" | "inbox" | "setup";

export interface AdminPage {
  href: string;
  /** The tab's name; it is also the page's own heading. Kept to one short word so four tabs fit across a phone. */
  label: string;
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
      { href: "/admin/pricing", label: "Pricing" },
    ],
  },
  {
    id: "people",
    label: "People",
    pages: [
      { href: "/admin/users", label: "Accounts" },
      { href: "/admin/students", label: "Applicants" },
      { href: "/admin/contacts", label: "Contacts" },
      { href: "/admin/employees", label: "Staff" },
    ],
  },
  {
    id: "classes",
    label: "Classes",
    pages: [
      { href: "/admin/today", label: "Today" },
      { href: "/admin/schedule", label: "Schedule" },
      { href: "/admin/lessons", label: "Lessons" },
      { href: "/admin/discord", label: "Discord" },
    ],
  },
  {
    id: "inbox",
    label: "Inbox",
    pages: [
      { href: "/admin/support", label: "Support Chat" },
      { href: "/admin/messages", label: "Messages" },
      { href: "/admin/sent", label: "Sent" },
    ],
  },
  {
    id: "setup",
    label: "Setup",
    pages: [
      { href: "/admin/settings", label: "Settings" },
      { href: "/admin/security", label: "System" },
      { href: "/admin/activity", label: "Activity" },
      { href: "/admin/roadmaps", label: "Roadmaps" },
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
