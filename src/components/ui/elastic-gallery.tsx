"use client";

// From 21st.dev: Elastic Gallery by daiwiikharihar. Adapted to this app: takes
// its panels as props, links each one, and uses the app's dark ground.
import { useCallback, useState } from "react";
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
  // A photo that cannot be loaded (two of them come from another host) is replaced by a tinted block; the instrument's name is
  // already drawn over the panel, so the card still reads and still links.
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());
  const markFailed = useCallback((id: string) => setFailed((prev) => (prev.has(id) ? prev : new Set(prev).add(id))), []);

  return (
    <div className={cn("flex h-[480px] w-full flex-col gap-2 md:h-[560px] md:flex-row md:gap-4", className)}>
      {items.map((item) => {
        const active = activeId === item.id;
        return (
          <div
            key={item.id}
            onMouseEnter={() => setActiveId(item.id)}
            onClick={() => setActiveId(item.id)}
            className={cn(
              "relative cursor-pointer overflow-hidden rounded-2xl bg-neu-base shadow-raised-low",
              "transition-[flex,filter] duration-700 ease-[cubic-bezier(0.25,1,0.5,1)]",
              active ? "flex-[4] brightness-100" : "flex-[1] brightness-50 hover:brightness-75",
            )}
          >
            <div className="absolute inset-0">
              {failed.has(item.id) ? (
                <div role="img" aria-label={item.alt} className="h-full w-full bg-gradient-to-br from-signal/35 via-neu-lift to-neu-base" />
              ) : (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={item.src}
                  alt={item.alt}
                  loading="lazy"
                  onError={() => markFailed(item.id)}
                  // An image that failed before the page became interactive never fires onError here, so it is checked once on mount.
                  ref={(el) => {
                    if (el && el.complete && el.naturalWidth === 0) markFailed(item.id);
                  }}
                  style={{ objectPosition: item.position ?? "center" }}
                  className={cn("h-full w-full object-cover transition-transform duration-1000", active ? "scale-100" : "scale-110")}
                />
              )}
              <div className={cn("absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent transition-opacity duration-500", active ? "opacity-100" : "opacity-0")} />
            </div>

            <div className="absolute inset-0 flex flex-col justify-end p-5 md:p-8">
              <div className={cn("flex flex-col gap-3 transition-[translate,scale,opacity] duration-500", active ? "translate-y-0 opacity-100 delay-200" : "pointer-events-none translate-y-12 opacity-0")}>
                <h3 className="font-hero text-4xl font-bold leading-none text-white md:text-6xl">{item.title}</h3>
                <Link href={item.href} className="tap inline-flex w-fit items-center gap-2 text-small font-semibold text-white/90 transition hover:text-white">
                  Start
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
              </div>

              <div className={cn("absolute bottom-5 left-1/2 -translate-x-1/2 transition-[translate,scale,opacity] duration-500 md:bottom-8", active ? "scale-50 opacity-0" : "opacity-100 delay-500")}>
                <span className="hidden whitespace-nowrap text-title font-bold text-white [writing-mode:vertical-rl] md:block">{item.title}</span>
                <span className="block text-small font-bold text-white md:hidden">{item.title}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
