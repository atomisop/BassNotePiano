"use client";

import { useEffect, useRef, useState } from "react";
import Image, { type ImageProps } from "next/image";
import { decode } from "blurhash";
import { BLUR_PLACEHOLDERS } from "@/lib/blurPlaceholders.generated";
import { cn } from "@/lib/utils";

const SIZE = 32;

/** Draws a BlurHash into a small canvas that CSS stretches to fill its box. */
function BlurhashCanvas({ hash, className }: { hash: string; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    try {
      const pixels = decode(hash, SIZE, SIZE);
      const image = ctx.createImageData(SIZE, SIZE);
      image.data.set(pixels);
      ctx.putImageData(image, 0, 0);
    } catch {
      // A bad hash just leaves the plain background.
    }
  }, [hash]);
  return <canvas ref={ref} width={SIZE} height={SIZE} aria-hidden className={cn("absolute inset-0 h-full w-full", className)} />;
}

/**
 * A photo that arrives out of a soft blur of its own colours instead of out of an empty box: the picture's BlurHash (made by
 * scripts/make-blur-placeholders.mjs for the images in public/) is drawn first, and fades away when the real image has loaded.
 * Images with no hash behave exactly like next/image. The parent must be `relative` and sized (this fills it), like `fill` images.
 */
export function BlurhashImage({ src, alt, hash, className, onLoad, ...rest }: Omit<ImageProps, "fill" | "placeholder" | "src"> & { src: string; alt: string; hash?: string }) {
  const [loaded, setLoaded] = useState(false);
  const known = hash ?? BLUR_PLACEHOLDERS[src];
  return (
    <>
      {known && <BlurhashCanvas hash={known} className={cn("transition-opacity duration-500 ease-out", loaded && "opacity-0")} />}
      <Image
        {...rest}
        src={src}
        alt={alt}
        fill
        onLoad={(e) => {
          setLoaded(true);
          onLoad?.(e);
        }}
        className={cn(known && "transition-opacity duration-500 ease-out", known && !loaded && "opacity-0", className)}
      />
    </>
  );
}
