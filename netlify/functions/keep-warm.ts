import { schedule } from "@netlify/functions";

// Every 5 minutes, ask the site for the sign-in page so the server never goes to sleep (2026-10-31 speed pass). The first visit after a
// quiet spell used to wait about 11 seconds while the server woke up; once warm, pages answer in 0.2 to 0.3 seconds.
//
// The sign-in page renders without touching the database, on purpose: keeping the database (Neon) awake around the clock would use
// up its free compute hours. It wakes on its own in about a second when someone signs in.
//
// Deliberately NOT wrapped in runJob like the other scheduled functions: that writes a row to the database on every run, which would
// keep the database awake after all. Nothing reads this job's history; if it ever stops, the only effect is slower first visits.
export const handler = schedule("*/5 * * * *", async () => {
  const base = process.env.NEXTAUTH_URL || process.env.URL;
  if (!base) return { statusCode: 200 };
  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/login`, { headers: { "User-Agent": "bnp-keep-warm" }, redirect: "manual" });
    await res.arrayBuffer().catch(() => undefined);
  } catch {
    // A failed knock just means the next visitor may wait; the watchdog and the outside monitor report a real outage.
  }
  return { statusCode: 200 };
});
