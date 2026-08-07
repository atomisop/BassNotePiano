import Image from "next/image";

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[480px] bg-[radial-gradient(ellipse_at_top,_rgba(217,180,88,0.14),_transparent_60%)]"
      />
      <header className="relative flex items-center gap-2.5 px-6 py-6">
        <Image src="/logo-mark.png" alt="" width={26} height={26} className="h-[26px] w-[26px]" priority />
        <span className="font-serif text-sm tracking-[0.2em] text-slate-200">
          BASS NOTE <span className="text-amber-400">PIANO</span>
        </span>
      </header>
      <main className="relative flex flex-1 items-center justify-center px-6 pb-16">{children}</main>
    </div>
  );
}
