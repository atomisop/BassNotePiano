/**
 * Re-mounts on every navigation within the dashboard, which is what gives
 * each page its enter animation. It sits INSIDE (dashboard)/layout.tsx, so
 * the sidebar, top bar, mobile tab bar and any open modals persist and are
 * untouched — only the page body animates.
 */
export default function DashboardTemplate({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
