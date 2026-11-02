"use client";

// From 21st.dev: Elastic Gallery by daiwiikharihar. Adapted to this app: takes
// its panels as props, links each one, and uses the app's dark ground.
//
// The elastic part (one panel wide, the others squeezed to strips that open on
// hover) only runs from lg up, where there is a mouse to hover with. On a phone
// or an iPad there is no hover: the strips were 75px slivers of photo with a
// label floating over them and the only way to open one was to tap it first,
// then tap Start (2026-11-02 audit). So under lg every panel is the same size,
// fully lit, with its title and Start always showing: three equal cards stacked
// on a phone, three across on a tablet.
import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "@/components/ui/appIcons";
import { cn } from "@/lib/utils";

export interface ElasticItem {
  id: string;
  title: string;
  src: string;
  alt: string;
  href: string;
  /** CSS object-position for the photo. */
  position?: string;
}

export function ElasticGallery({ items, className }: { items: ElasticItem[]; className?: string }) {
  const [activeId, setActiveId] = useState<string>(items[0]?.id ?? "");

  return (
    <div className={cn("flex w-full flex-col gap-3 md:h-[420px] md:flex-row md:gap-4 lg:h-[560px]", className)}>
      {items.map((item) => {
        const active = activeId === item.id;
        return (
          <div
            key={item.id}
            onMouseEnter={() => setActiveId(item.id)}
            onClick={() => setActiveId(item.id)}
            className={cn(
              "relative h-48 overflow-hidden rounded-2xl bg-neu-base shadow-raised-low md:h-auto md:flex-1",
              "lg:transition-[flex,filter] lg:duration-700 lg:ease-[cubic-bezier(0.25,1,0.5,1)]",
              active ? "lg:flex-[4] lg:brightness-100" : "lg:flex-[1] lg:brightness-50 lg:hover:brightness-75",
            )}
          >
            <div className="absolute inset-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.src}
                alt={item.alt}
                loading="lazy"
                style={{ objectPosition: item.position ?? "center" }}
                className={cn("h-full w-full object-cover lg:transition-transform lg:duration-1000", active ? "lg:scale-100" : "lg:scale-110")}
              />
              <div className={cn("absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent lg:transition-opacity lg:duration-500", active ? "lg:opacity-100" : "lg:opacity-0")} />
            </div>

            <div className="absolute inset-0 flex flex-col justify-end p-5 md:p-6 lg:p-8">
              <div
                className={cn(
                  "flex flex-col gap-3 lg:transition-[translate,scale,opacity] lg:duration-500",
                  active ? "lg:translate-y-0 lg:opacity-100 lg:delay-200" : "lg:pointer-events-none lg:translate-y-12 lg:opacity-0",
                )}
              >
                <h3 className="font-hero text-4xl font-bold leading-none text-white lg:text-6xl">{item.title}</h3>
                <Link href={item.href} className="tap inline-flex w-fit items-center gap-2 text-small font-semibold text-white/90 transition hover:text-white">
                  Start
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
              </div>

              {/* The strip's own label, only in the elastic layout. */}
              <div
                className={cn(
                  "absolute bottom-8 left-1/2 hidden -translate-x-1/2 transition-[translate,scale,opacity] duration-500 lg:block",
                  active ? "scale-50 opacity-0" : "opacity-100 delay-500",
                )}
              >
                <span className="whitespace-nowrap text-title font-bold text-white [writing-mode:vertical-rl]">{item.title}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
