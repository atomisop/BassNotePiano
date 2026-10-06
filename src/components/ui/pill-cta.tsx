import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** The orange pill with a dark arrow circle, used for every primary call to action on the homepage. */
export function PillCTA({
  href,
  children,
  className,
  external = false,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
  external?: boolean;
}) {
  const Tag = external ? "a" : Link;
  const externalProps = external ? { target: "_blank", rel: "noopener noreferrer" } : {};
  return (
    <Tag
      href={href}
      {...externalProps}
      className={cn(
        "tap group inline-flex items-center gap-2 self-start rounded-full bg-[rgb(var(--c-a-400))] py-1 pl-5 pr-1 text-sm font-medium text-black transition-all hover:gap-3 sm:text-base",
        className,
      )}
    >
      {children}
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black transition-transform group-hover:scale-110 sm:h-10 sm:w-10">
        <ArrowRight className="h-4 w-4 text-[#E1E0CC]" />
      </span>
    </Tag>
  );
}
