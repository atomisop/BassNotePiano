import Image from "next/image";
import Link from "next/link";
import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NotificationBell } from "@/components/notifications/NotificationBell";

/**
 * The user's real photo, fetched here rather than read off the session —
 * `image` is deliberately excluded from the JWT (see `auth.ts`'s
 * `loadEntitlements` comment: it can be a multi-KB base64 data URI, and
 * that's too large for a session cookie). Same "fetch it directly from the
 * DB" convention `/profile` already uses, not a new pattern.
 */
async function ProfileAvatarLink() {
  const session = await getServerAuthSession();
  if (!session?.user) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, username: true, image: true },
  });
  if (!user) return null;

  return (
    <Link
      href="/profile"
      aria-label="Your profile"
      className="h-8 w-8 shrink-0 overflow-hidden rounded-full border border-[rgb(var(--c-a-400)/0.3)] bg-[rgb(var(--c-a-400)/0.1)] transition hover:border-[rgb(var(--c-a-400)/0.6)]"
    >
      {user.image ? (
        // eslint-disable-next-line @next/next/no-img-element -- data URI, next/image can't optimize it
        <img src={user.image} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center font-serif text-sm text-[rgb(var(--c-a-300))]">
          {(user.name ?? user.username ?? "?").charAt(0).toUpperCase()}
        </div>
      )}
    </Link>
  );
}

export function TopBar() {
  return (
    <header className="chrome flex h-16 shrink-0 items-center justify-between border-b border-ink/10 px-8">
      <Link href="/" className="flex items-center gap-2.5 font-serif text-sm tracking-[0.2em] text-slate-200">
        <Image src="/logo-mark.png" alt="" width={28} height={28} className="h-7 w-7" priority />
        BASS NOTE <span className="text-[rgb(var(--c-a-400))]">PIANO</span>
      </Link>
      <div className="flex items-center gap-3">
        <NotificationBell />
        <ProfileAvatarLink />
      </div>
    </header>
  );
}
