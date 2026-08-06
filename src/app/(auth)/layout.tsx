import Link from "next/link";
import { BACKDROPS } from "@/lib/backdrops";
import { PhotoBackdrop } from "@/components/ui/PhotoBackdrop";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col">
      {/* Fixed, not scoped to a section — persists identically across all 5 auth
          screens (login/register/forgot/reset/verify) so navigating between them
          never flashes a different photo. */}
      <div className="fixed inset-0 -z-10">
        <PhotoBackdrop src={BACKDROPS.auth} scrim="standard" priority sizes="100vw" />
      </div>
      <header className="relative px-6 py-6">
        <Link href="/" className="font-serif text-sm tracking-[0.2em] text-slate-100">
          BASS NOTE <span className="text-amber-400">PIANO</span>
        </Link>
      </header>
      <main className="relative flex flex-1 items-center justify-center px-6 pb-16">{children}</main>
    </div>
  );
}
