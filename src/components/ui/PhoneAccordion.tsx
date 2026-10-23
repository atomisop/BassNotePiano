"use client";

import { useEffect, useState, type ReactNode } from "react";
import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A section that is collapsed on phones and always open from md up, so a long page of cards becomes a short list of titles you
 * open only when you want them. The summary stays visible while it is closed (a count, a status), so closing a section never
 * hides the one fact you came for.
 *
 * Built on the same Radix accordion as `ui/accordion.tsx` (keyboard, aria-expanded and focus come from it). The content is
 * force-mounted and hidden by CSS only below md, so the server render matches the client at every width, and from md up it
 * is never hidden at all. Below md the title is the trigger; from md up it is a plain heading.
 */
export function PhoneAccordion({
  title,
  summary,
  warn = false,
  defaultOpen = false,
  id,
  className,
  children,
}: {
  title: string;
  /** Shown to the right of the title while closed on a phone. */
  summary?: ReactNode;
  /** Colours the summary as a problem. */
  warn?: boolean;
  defaultOpen?: boolean;
  /** An address like `/admin#tasks` opens this section on a phone, where it would otherwise be closed. */
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  const [value, setValue] = useState(defaultOpen ? "section" : "");
  const open = value === "section";
  useEffect(() => {
    if (id && window.location.hash === `#${id}`) setValue("section");
  }, [id]);

  return (
    <AccordionPrimitive.Root asChild type="single" collapsible value={value} onValueChange={setValue}>
      <section id={id} className={cn("p-5", className)}>
        <AccordionPrimitive.Item value="section">
          <h2 className="hidden text-body font-semibold text-slate-50 md:block">{title}</h2>
          <AccordionPrimitive.Header asChild>
            <h2 className="md:hidden" data-jump-title={title}>
              <AccordionPrimitive.Trigger className="tap -my-1 flex w-full items-center justify-between gap-3 py-1 text-left">
                <span className="text-body font-semibold text-slate-50">{title}</span>
                <span className="flex items-center gap-2">
                  {summary != null && !open && <span className={cn("text-small", warn ? "font-medium text-red-300" : "text-slate-400")}>{summary}</span>}
                  <ChevronDown aria-hidden className={cn("h-4 w-4 shrink-0 text-slate-400 transition-transform", open && "rotate-180")} />
                </span>
              </AccordionPrimitive.Trigger>
            </h2>
          </AccordionPrimitive.Header>
          <AccordionPrimitive.Content forceMount className="mt-3 data-[state=closed]:max-md:hidden">
            {children}
          </AccordionPrimitive.Content>
        </AccordionPrimitive.Item>
      </section>
    </AccordionPrimitive.Root>
  );
}
