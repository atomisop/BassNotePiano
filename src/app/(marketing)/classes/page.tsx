import Link from "next/link";
import { BACKDROPS } from "@/lib/backdrops";
import { PhotoBackdrop } from "@/components/ui/PhotoBackdrop";
import { ClassRegistrationForm } from "./ClassRegistrationForm";

export default function ClassesPage() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="fixed inset-0 -z-10">
        <PhotoBackdrop src={BACKDROPS.classes} scrim="standard" priority sizes="100vw" />
      </div>

      <header className="relative mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Link href="/" className="font-serif text-sm tracking-[0.2em] text-slate-100">
          BASS NOTE <span className="text-amber-400">PIANO</span>
        </Link>
        <nav className="flex items-center gap-6 text-sm text-slate-200">
          <Link href="/pricing" className="transition hover:text-amber-300">
            Pricing
          </Link>
          <Link href="/login" className="glass-pill px-4 py-1.5 text-slate-100 transition hover:text-amber-300">
            Log in
          </Link>
        </nav>
      </header>

      <section className="relative mx-auto max-w-lg px-6 pb-24 pt-6">
        <div className="text-center">
          <p className="glass-pill mx-auto mb-4 w-fit px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-amber-300">
            Register for classes
          </p>
          <h1 className="font-serif text-3xl text-slate-50 sm:text-4xl">Learn with us in person</h1>
          <p className="mx-auto mt-4 max-w-md text-sm text-slate-200 sm:text-base">
            Tell us what you'd like to learn and where you're starting from — we'll follow up by phone or email to
            get you scheduled.
          </p>
        </div>

        <div className="mt-8">
          <ClassRegistrationForm />
        </div>
      </section>

      <footer className="relative border-t border-white/10 px-6 py-8 text-center text-xs text-slate-400">
        Bass Note Piano — a digital companion to the Ethiopian Scales, Rhythm &amp; Chords curriculum book.
      </footer>
    </div>
  );
}
