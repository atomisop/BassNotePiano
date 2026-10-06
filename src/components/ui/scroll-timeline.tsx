"use client";

import { useLayoutEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

if (typeof window !== "undefined") gsap.registerPlugin(ScrollTrigger);

export interface ScrollTimelineStep {
  marker: string;
  title: string;
  description: string;
}

/**
 * A pinned, horizontally scrolling timeline: the section holds still while the
 * track slides sideways, and each step draws its stem and rises into view as
 * it reaches the middle. Steps alternate above and below a line that draws
 * itself across. With reduced motion nothing pins and the track just scrolls.
 */
export function ScrollTimeline({
  label,
  title,
  steps,
}: {
  label: string;
  title: string;
  steps: ScrollTimelineStep[];
}) {
  const sectionRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const section = sectionRef.current;
    const track = trackRef.current;
    if (!section || !track) return;

    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const distance = () => Math.max(0, track.scrollWidth - window.innerWidth);
      const stemsTop = gsap.utils.toArray<HTMLElement>("[data-stem]", track);
      const dots = gsap.utils.toArray<HTMLElement>("[data-dot]", track);
      const copy = gsap.utils.toArray<HTMLElement>("[data-copy]", track);

      gsap.set("[data-line]", { scaleX: 0, transformOrigin: "left center" });
      gsap.set(stemsTop, { scaleY: 0 });
      gsap.set(dots, { scale: 0 });
      gsap.set(copy, { y: 40, opacity: 0 });

      const tl = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: {
          trigger: section,
          start: "top top",
          end: () => `+=${distance()}`,
          scrub: true,
          pin: true,
          anticipatePin: 1,
          invalidateOnRefresh: true,
        },
      });

      tl.to(track, { x: () => -distance(), duration: 1 }, 0);
      tl.to("[data-line]", { scaleX: 1, duration: 1 }, 0);

      steps.forEach((_, i) => {
        const at = 0.08 + (i * 0.8) / steps.length;
        const span = 0.16;
        tl.to(stemsTop[i], { scaleY: 1, duration: span * 0.5 }, at);
        tl.to(dots[i], { scale: 1, duration: span * 0.5 }, at);
        tl.to(
          copy[i],
          { y: 0, opacity: 1, duration: span, ease: "power2.out" },
          at + span * 0.2,
        );
      });
    });

    return () => mm.revert();
  }, [steps]);

  return (
    <section
      ref={sectionRef}
      aria-label={label}
      className="relative h-screen w-full p-2 sm:p-3"
    >
      <div className="relative h-full w-full overflow-hidden rounded-2xl bg-black md:rounded-[2rem]">
        <div
          ref={trackRef}
          className="relative flex h-full w-max items-stretch pl-6 md:pl-16"
        >
          <div
            data-line
            aria-hidden
            className="absolute left-[calc(min(82vw,34rem)+1.5rem)] right-0 top-1/2 h-px bg-[rgb(var(--c-a-400))] md:left-[calc(min(82vw,34rem)+4rem)]"
          />

          <div className="relative flex w-[min(82vw,34rem)] shrink-0 flex-col justify-center pr-8">
            <p className="mb-4 text-small uppercase tracking-[0.18em] text-[#E1E0CC]/50">
              {label}
            </p>
            <h2 className="text-[clamp(3rem,9vw,8rem)] font-medium leading-[0.88] tracking-[-0.06em] text-[#E1E0CC]">
              {title}
            </h2>
            <p className="mt-6 text-small text-[#E1E0CC]/50">Keep scrolling</p>
          </div>

          {steps.map((step, i) => {
            const above = i % 2 === 0;
            return (
              <div
                key={step.marker}
                className="relative w-[min(78vw,26rem)] shrink-0"
              >
                <span
                  data-dot
                  aria-hidden
                  className="absolute left-0 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[rgb(var(--c-a-400))]"
                />
                <span
                  data-stem
                  aria-hidden
                  className={`absolute left-0 h-[12vh] w-px bg-[rgb(var(--c-a-400))] ${above ? "bottom-1/2 origin-bottom" : "top-1/2 origin-top"}`}
                />
                <div
                  data-copy
                  className={`absolute left-0 w-full pl-5 pr-4 ${above ? "bottom-[calc(50%+12vh)]" : "top-[calc(50%+12vh)]"}`}
                >
                  <p className="font-mono text-small text-[rgb(var(--c-a-400))]">
                    {step.marker}
                  </p>
                  <h3 className="mt-2 text-[clamp(1.5rem,3vw,2.25rem)] font-medium leading-[1] tracking-[-0.04em] text-[#E1E0CC]">
                    {step.title}
                  </h3>
                  <p className="mt-3 max-w-[24rem] text-small leading-relaxed text-[#E1E0CC]/60 md:text-body">
                    {step.description}
                  </p>
                </div>
              </div>
            );
          })}

          <div className="w-[20vw] shrink-0" />
        </div>
      </div>
    </section>
  );
}
