"use client";

import { useEffect, useState } from "react";

/**
 * Time-of-day greeting, resolved in the browser.
 *
 * It has to be client-side: the server has no idea what time it is where the
 * student is sitting, and rendering "Good evening" from a US-East server to
 * someone in Addis would be wrong more often than right. Computing it during
 * render instead of in an effect would produce different HTML on the server
 * than on the client and trip a hydration mismatch — so the neutral form is
 * rendered first and upgraded on mount. Only the greeting word changes; the
 * name beside it never moves.
 */
function greetingFor(hour: number): string {
  if (hour < 5) return "Still up";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function TodayGreeting({ name }: { name: string | null }) {
  const [greeting, setGreeting] = useState("Welcome back");

  useEffect(() => {
    setGreeting(greetingFor(new Date().getHours()));
  }, []);

  return (
    <h1 className="font-serif text-3xl text-slate-50 sm:text-4xl">
      {greeting}
      {name ? <>, {name.split(" ")[0]}</> : null}.
    </h1>
  );
}
