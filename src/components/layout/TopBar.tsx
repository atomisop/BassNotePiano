import Link from "next/link";
import { NotificationBell } from "@/components/notifications/NotificationBell";

export function TopBar() {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 bg-slate-950/40 px-8 backdrop-blur-2xl">
      <Link href="/" className="font-serif text-sm tracking-[0.2em] text-slate-200">
        BASS NOTE <span className="text-amber-400">PIANO</span>
      </Link>
      <NotificationBell />
    </header>
  );
}
