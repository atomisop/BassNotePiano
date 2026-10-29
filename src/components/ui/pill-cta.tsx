import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** The orange pill with a dark arrow circle, used for every primary call to action on the homepage. */
export function PillCTA({
  href,
  children,
  className,
  external = false,
  secondary = false,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
  external?: boolean;
  /** The quieter of a pair: an outlined pill beside the solid one, like apple.com's "Learn more" and "Buy". */
  secondary?: boolean;
}) {
  const Tag = external ? "a" : Link;
  const externalProps = external ? { target: "_blank", rel: "noopener noreferrer" } : {};
  return (
    <Tag
      href={href}
      {...externalProps}
      className={cn(
        "tap group inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full px-6 py-2.5 text-base font-medium transition-[filter,background-color] hover:brightness-110 active:brightness-95",
        secondary
          ? "border border-amber-400 text-amber-400 hover:bg-amber-400/10"
          : "bg-amber-400 text-black",
        className,
      )}
    >
      {children}
      {!secondary && <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />}
    </Tag>
  );
}
