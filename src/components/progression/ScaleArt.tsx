"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * A scale's picture, faded behind its card. The pictures live in the public R2 bucket as scale-art/<scale slug>.jpg (upload them with
 * scripts/upload-scale-art.mjs). The card color is laid over the picture, lighter at the top right where its subject sits, so the text
 * on the left stays easy to read. A scale with no picture yet (a new one the owner added) simply shows the plain card. Locked scales get
 * a grayer, fainter picture.
 */
export function ScaleArt({ src, locked }: { src: string; locked: boolean }) {
  const [state, setState] = useState<"loading" | "shown" | "missing">("loading");
  const img = useRef<HTMLImageElement>(null);
  // A picture already in the browser cache can finish before React is listening: check once after mount.
  useEffect(() => {
    const el = img.current;
    if (el?.complete) setState(el.naturalWidth > 0 ? "shown" : "missing");
  }, [src]);
  if (state === "missing") return null;
  return (
    <span aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-[inherit]">
      {/* A plain img: the picture comes straight from R2 (already allowed by the security policy), already small. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={img}
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        onLoad={() => setState("shown")}
        onError={() => setState("missing")}
        className={cn("h-full w-full object-cover transition-opacity duration-500", state === "shown" ? "opacity-100" : "opacity-0", locked && "grayscale")}
      />
      <span className={cn("scale-art-fade absolute inset-0", locked && "scale-art-fade-locked")} />
    </span>
  );
}
