import Image from "next/image";
import Link from "next/link";
import { BACKDROPS } from "@/lib/backdrops";
import { PhotoBackdrop } from "@/components/ui/PhotoBackdrop";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    /* No `bg-*` on this wrapper: it would paint over the -z-10 backdrop
       below and hide the photo entirely. The ground comes from <body> and
       from PhotoBackdrop's own base layer. */
    <div className="relative flex min-h-screen flex-col items-center justify-center px-6 py-16">
      {/* Fixed, not scoped to a section — persists identically across all five
          auth screens (login/register/forgot/reset/verify) so moving between
          them never re-flashes a different photo. The scrim is theme-aware,
          so this reads as a soft ghost on paper and a fuller image on the
          dark themes without the markup knowing which is active. */}
      <div className="fixed inset-0 -z-10">
        <PhotoBackdrop src={BACKDROPS.auth} scrim="standard" priority sizes="100vw" />
      </div>
      <Link href="/" className="relative mb-8 flex flex-col items-center text-center">
        <Image src="/logo-mark.png" alt="" width={44} height={44} className="mb-2 h-11 w-11" priority />
        <p className="font-serif text-2xl tracking-[0.05em] text-slate-50">
          Bass Note <span className="text-[rgb(var(--c-a-400))]">Piano</span>
        </p>
        <p className="mt-1 text-sm text-slate-400">Ethiopian scale theory, practiced.</p>
      </Link>
      <main className="relative flex w-full justify-center">{children}</main>
    </div>
  );
}
