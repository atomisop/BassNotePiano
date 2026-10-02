import { cn } from "@/lib/utils";

const SIZES = {
  sm: "h-8 w-8",
  md: "h-10 w-10",
  lg: "h-14 w-14",
  xl: "h-24 w-24",
} as const;

/**
 * Round profile photo with an initial as the fallback. Purely an image of a
 * person, so it stays ink and paper. When it is tappable, the parent link
 * or button carries the focus ring.
 */
export function Avatar({
  image,
  label,
  size = "md",
  className,
}: {
  image: string | null;
  label: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden rounded-full border border-ink/10 bg-slate-800 shadow-plane-mid",
        SIZES[size],
        className,
      )}
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-small font-semibold text-slate-300">
          {label.charAt(0).toUpperCase()}
        </div>
      )}
    </div>
  );
}
