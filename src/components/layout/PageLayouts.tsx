import type { ReactNode } from "react";

/**
 * The four page layouts every signed-in page is built on. A page picks one
 * of these on purpose instead of setting its own max-width, so widths stay
 * consistent across the whole app and nothing ends up narrow by accident.
 * The widths themselves are the --container-* tokens in globals.css.
 *
 * - WideLayout: dashboards, the lesson page, admin, billing. Uses the full
 *   screen up to 1440px; the page lays out its own columns inside.
 * - TwoPaneLayout: a list on the left and a detail area on the right
 *   (Messages, Friends).
 * - SettingsLayout: a side menu plus the selected section.
 * - NarrowLayout: short forms only (auth, onboarding, small flows).
 */

type LayoutProps = {
  children: ReactNode;
  className?: string;
};

export function WideLayout({ children, className = "" }: LayoutProps) {
  return <div className={`mx-auto w-full max-w-wide ${className}`}>{children}</div>;
}

/**
 * In a 440px column the full Hero size (up to 72px) would wrap a short
 * title onto three lines, so the hero tier is scaled down here. Same tier,
 * just sized to its column.
 */
export function NarrowLayout({ children, className = "" }: LayoutProps) {
  return (
    <div
      className={`mx-auto w-full max-w-narrow ${className}`}
      style={{ ["--text-hero" as string]: "clamp(2rem, 1.6rem + 1.4vw, 2.75rem)" }}
    >
      {children}
    </div>
  );
}

/**
 * `menu` holds both the desktop side menu and the mobile list; the page
 * decides which of its own pieces show at which width. `header` sits above
 * the menu and content row.
 */
export function SettingsLayout({
  header,
  menu,
  children,
  className = "",
}: LayoutProps & { header?: ReactNode; menu: ReactNode }) {
  return (
    <div className={`mx-auto w-full max-w-settings ${className}`}>
      {header}
      <div className={`${header ? "mt-6 " : ""}flex flex-col gap-8 lg:flex-row`}>
        {menu}
        {children}
      </div>
    </div>
  );
}

/**
 * Two modes for phones (below the md breakpoint):
 * - "switch": one pane at a time, like iOS Messages. `showDetail` picks which.
 * - "stack": both panes in one column, the detail pane first.
 * From md up, the list is a fixed-width column on the left and the detail
 * fills the rest.
 */
export function TwoPaneLayout({
  list,
  detail,
  header,
  mobile = "switch",
  showDetail = false,
  className = "",
}: {
  list: ReactNode;
  detail: ReactNode;
  header?: ReactNode;
  mobile?: "switch" | "stack";
  showDetail?: boolean;
  className?: string;
}) {
  if (mobile === "stack") {
    return (
      <div className="mx-auto w-full max-w-wide">
        {header}
        <div className={`${header ? "mt-6 " : ""}flex flex-col gap-6 md:flex-row md:items-start ${className}`}>
          <div className="min-w-0 md:w-[var(--container-pane)] md:shrink-0">{list}</div>
          <div className="order-first min-w-0 flex-1 md:order-none">{detail}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-wide">
      {header}
      <div className={`${header ? "mt-6 " : ""}flex ${className}`}>
        <div className={`${showDetail ? "hidden md:flex" : "flex"} min-w-0 md:w-[var(--container-pane)] md:shrink-0`}>
          {list}
        </div>
        <div className={`${showDetail ? "flex" : "hidden md:flex"} min-w-0 flex-1`}>{detail}</div>
      </div>
    </div>
  );
}
