"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * The page title, on phones, as the second row of the top card (logo, credits, Ask AI and profile are the first), so the title and the
 * buttons are one card, as in the Claude app. Each page still writes its own heading (`[data-deck-header] h1`); this reads its words
 * and hides that heading on phones (a `data-bar-title` flag on <html>, see globals.css), along with the small label above it. A heading
 * block left with nothing in it is hidden too. Home keeps its greeting as the title. From md up the heading stays in the page and this row is gone.
 *
 * It also reports the card's height (`--bar-h` on <html>) so the page's top padding, the announcement bar and the pinned headings
 * follow it when the title row appears or goes.
 */
export function BarTitle() {
  const pathname = usePathname();
  const [title, setTitle] = useState("");
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const main = document.getElementById("app-scroll");
    const phone = window.matchMedia("(max-width: 767.98px)");
    if (!main) return;
    let frame = 0;

    function read() {
      frame = 0;
      if (!main) return;
      const root = document.documentElement;
      if (!phone.matches || pathname === "/dashboard") {
        root.removeAttribute("data-bar-title");
        setTitle("");
        return;
      }
      const text = main.querySelector<HTMLElement>("[data-deck-header] h1")?.textContent?.trim() ?? "";
      // Only a flag on <html>, never an edit inside the page: the page's own markup is React's, and changing it before it has hydrated breaks it.
      if (text) root.setAttribute("data-bar-title", "");
      else root.removeAttribute("data-bar-title");
      setTitle(text);
    }
    const queue = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };

    read();
    const observer = new MutationObserver(queue);
    observer.observe(main, { childList: true, subtree: true });
    phone.addEventListener("change", queue);
    return () => {
      observer.disconnect();
      document.documentElement.removeAttribute("data-bar-title");
      phone.removeEventListener("change", queue);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [pathname]);

  // Tell the page how tall the card is now.
  useEffect(() => {
    const bar = rowRef.current?.closest("header");
    if (!bar) return;
    const report = () => document.documentElement.style.setProperty("--bar-h", `${bar.offsetHeight}px`);
    report();
    const sizes = new ResizeObserver(report);
    sizes.observe(bar);
    return () => {
      sizes.disconnect();
      document.documentElement.style.removeProperty("--bar-h");
    };
  }, []);

  return (
    <div ref={rowRef} className={`basis-full px-2 md:hidden ${title ? "pb-2.5 pt-1" : "hidden"}`}>
      <h1 className="truncate font-hero text-headline font-bold text-slate-50">{title}</h1>
    </div>
  );
}
