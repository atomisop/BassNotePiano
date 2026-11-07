"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Settings } from "@/components/ui/appIcons";

/** The top bar's Settings button (a gear). The person's picture and menu live on the dock's island. */
export function TopSettingsLink() {
  const here = usePathname().startsWith("/account");
  return (
    <Link
      href="/account"
      aria-label="Settings"
      aria-current={here ? "page" : undefined}
      data-tour="nav-settings"
      className={`tap press relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neu-base text-slate-50 ${here ? "shadow-pressed-low" : "shadow-raised-low hover:shadow-raised-mid active:shadow-pressed-low"}`}
    >
      <Settings className="h-5 w-5" strokeWidth={1.5} />
    </Link>
  );
}
