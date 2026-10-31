"use client";

import { useEffect, useState } from "react";
import { Hero } from "@/components/ui/Hero";

/**
 * Time-of-day greeting, resolved in the browser.
 *
 * It has to be client-side: the server has no idea what time it is where the
 * student is sitting, and rendering "Good evening" from a US-East server to
 * someone in Addis would be wrong more often than right. Computing it during
 * render instead of in an effect would produce different HTML on the server
 * than on the client and trip a hydration mismatch, so the neutral form is
 * rendered first and upgraded on mount. That first form is kept invisible, so
 * nobody sees "Welcome back" turn into "Good evening": the line holds its
 * space, then fades in already correct.
 */
function greetingFor(hour: number): string {
  if (hour < 5) return "Still up";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/** The Home screen's one Hero element (STEP 2C). */
export function TodayGreeting({ name, className }: { name: string | null; className?: string }) {
  const [greeting, setGreeting] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);

  useEffect(() => {
    const now = new Date();
    setGreeting(greetingFor(now.getHours()));
    setDate(now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }));
  }, []);

  const fade = `transition-opacity duration-200 motion-reduce:transition-none ${greeting === null ? "opacity-0" : "opacity-100"}`;
  return (
    <div className={className}>
      {/* Today's date over the greeting, by the student's own clock (so it is filled in the browser too; the line keeps its space). */}
      <p className={`text-small font-medium text-slate-400 ${fade}`}>{date ?? "\u00a0"}</p>
      <Hero className={`mt-1.5 ${fade}`}>
        {greeting ?? "Welcome back"}
        {name ? <>, {name.split(" ")[0]}</> : null}.
      </Hero>
    </div>
  );
}
