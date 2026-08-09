"use client";

// A horizontal, drag/scroll-snap carousel of phone-framed screenshots —
// a from-scratch, dependency-free implementation (this project has no
// shadcn/radix install) rather than a literal port. Each slide is a real
// phone bezel (notch, rounded corners, side buttons) clipping an <Image>,
// so whatever screenshot is passed in reads as "the app on a phone," not
// just a bare rectangle.

import Image from "next/image";
import { useRef } from "react";

export interface PhoneScreenshot {
  src: string;
  alt: string;
}

function PhoneFrame({ src, alt }: PhoneScreenshot) {
  return (
    <div className="relative shrink-0 snap-center" style={{ width: 260 }}>
      <div className="relative rounded-[2.5rem] border-[6px] border-slate-800 bg-slate-800 shadow-[0_30px_60px_-20px_rgba(0,0,0,0.6)]">
        {/* Notch */}
        <div className="absolute left-1/2 top-0 z-10 h-5 w-24 -translate-x-1/2 rounded-b-2xl bg-slate-800" />
        {/* Side button */}
        <div className="absolute -right-[7px] top-24 h-12 w-[3px] rounded-full bg-slate-700" />
        <div className="relative aspect-[9/19.5] w-full overflow-hidden rounded-[2rem] bg-slate-950">
          <Image src={src} alt={alt} fill sizes="260px" className="object-cover object-top" />
        </div>
      </div>
    </div>
  );
}

export function PhoneCarousel({ images }: { images: PhoneScreenshot[] }) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  function scrollBy(dir: 1 | -1) {
    scrollerRef.current?.scrollBy({ left: dir * 280, behavior: "smooth" });
  }

  if (images.length === 0) return null;

  return (
    <div className="relative">
      <div ref={scrollerRef} className="flex snap-x snap-mandatory gap-6 overflow-x-auto px-6 pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {images.map((img) => (
          <PhoneFrame key={img.src} {...img} />
        ))}
      </div>

      <button
        type="button"
        onClick={() => scrollBy(-1)}
        aria-label="Previous"
        className="glass-pill absolute left-2 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center text-slate-100 transition hover:text-amber-300 sm:flex"
      >
        <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
          <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <button
        type="button"
        onClick={() => scrollBy(1)}
        aria-label="Next"
        className="glass-pill absolute right-2 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center text-slate-100 transition hover:text-amber-300 sm:flex"
      >
        <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
          <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}
