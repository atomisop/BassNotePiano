"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Mail } from "lucide-react";
import { mailUnreadCountAction } from "@/app/(dashboard)/mail/actions";

const POLL_MS = 30_000;

/** The Mail icon in the top bar: serious messages (payments, billing, notes from the team), with an unread count. */
export function MailTopLink({ initialCount }: { initialCount: number }) {
  const pathname = usePathname();
  const active = pathname === "/mail" || pathname.startsWith("/mail/");
  const [count, setCount] = useState(initialCount);

  // The page that rendered this may have just changed the count (opening a message), so re-read on every navigation too.
  useEffect(() => {
    let cancelled = false;
    const load = () => mailUnreadCountAction().then((n) => !cancelled && setCount(n)).catch(() => {});
    load();
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [pathname]);

  return (
    <Link
      href="/mail"
      aria-label={count > 0 ? `Mail, ${count} unread` : "Mail"}
      title="Mail"
      aria-current={active ? "page" : undefined}
      className={`tap relative flex h-9 w-9 items-center justify-center rounded-lg bg-neu-base transition ${
        active
          ? "text-signal shadow-pressed-low"
          : "text-slate-400 shadow-raised-low hover:text-slate-200 hover:shadow-raised-mid active:shadow-pressed-low"
      }`}
    >
      <Mail className="h-[18px] w-[18px]" strokeWidth={1.5} />
      {count > 0 && (
        <span className="absolute -right-1 -top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-signal px-1 text-small font-bold text-slate-950">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
