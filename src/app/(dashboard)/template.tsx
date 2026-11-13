import { PageArrive } from "@/components/layout/PageArrive";

/**
 * Re-mounts on every navigation within the dashboard. It sits INSIDE (dashboard)/layout.tsx, so the sidebar, top bar, mobile tab bar
 * and any open modals persist and are untouched.
 *
 * A tab tap already shows the next screen's skeleton at once and crossfades to the real page (NavPendingGate, a view transition).
 * The arrival (PageArrive) adds a soft blur-to-sharp settle on top of that; it never starts from fully transparent, because an
 * arrival that did flashed the empty background between the skeleton and the page.
 */
export default function DashboardTemplate({ children }: { children: React.ReactNode }) {
  return <PageArrive>{children}</PageArrive>;
}
