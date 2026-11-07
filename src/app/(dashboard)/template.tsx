/**
 * Re-mounts on every navigation within the dashboard. It sits INSIDE (dashboard)/layout.tsx, so the sidebar, top bar, mobile tab bar
 * and any open modals persist and are untouched.
 *
 * It adds no animation of its own. A tab tap already shows the next screen's skeleton at once and crossfades to the real page
 * (NavPendingGate, a view transition); an arrival animation on top of that replayed from transparent and flashed the empty
 * background between the skeleton and the page, and nudged the skeleton down 6px as it did.
 */
export default function DashboardTemplate({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>;
}
