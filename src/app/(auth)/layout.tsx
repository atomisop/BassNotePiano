import Image from "next/image";
import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-slate-950 px-6 py-16">
      {/* Auth is a form, not a mood. The photo that used to sit behind these
          five screens made every input harder to read for no informational
          gain — the paper ground does the work now. */}
      <Link href="/" className="relative mb-8 flex flex-col items-center text-center">
        <Image src="/logo-mark.png" alt="" width={44} height={44} className="mb-2 h-11 w-11" priority />
        <p className="font-serif text-2xl tracking-[0.05em] text-slate-50">
          Bass Note <span className="text-amber-400">Piano</span>
        </p>
        <p className="mt-1 text-sm text-slate-400">Ethiopian scale theory, practiced.</p>
      </Link>
      <main className="relative flex w-full justify-center">{children}</main>
    </div>
  );
}
