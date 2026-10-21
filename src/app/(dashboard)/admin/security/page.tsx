import { getServerAuthSession } from "@/lib/auth";
import { isOwnerEmail } from "@/lib/adminNotifications";
import { prisma } from "@/lib/prisma";
import { isBrowserNoise } from "@/lib/csp";
import { CspClearButton } from "@/components/admin/CspClearButton";
import { clearCspViolationsAction } from "./actions";

export const metadata = { title: "Admin: Security" };

const DAY = 86_400_000;
const when = (d: Date) => d.toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export default async function AdminSecurityPage() {
  const session = await getServerAuthSession();
  if (!isOwnerEmail(session?.user.email)) {
    return (
      <div>
        <h1 className="font-hero text-hero font-bold text-balance mt-1.5 text-slate-50">Security</h1>
        <p className="mt-2 text-small text-slate-500">Only the owner can see this.</p>
      </div>
    );
  }

  const rows = await prisma.cspViolation.findMany({ orderBy: { lastSeenAt: "desc" }, take: 200 });
  const classified = rows.map((r) => ({ ...r, noise: isBrowserNoise(r) }));
  const since = new Date(Date.now() - 3 * DAY);
  const realRecent = classified.filter((r) => !r.noise && r.lastSeenAt >= since);
  const noiseCount = classified.filter((r) => r.noise).length;
  const oldest = rows.reduce<Date | null>((min, r) => (!min || r.firstSeenAt < min ? r.firstSeenAt : min), null);
  const watchedDays = oldest ? Math.floor((Date.now() - oldest.getTime()) / DAY) : 0;

  return (
    <div>
      <p className="text-small font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50)/0.8)]">Admin</p>
      <h1 className="font-hero text-hero font-bold text-balance mt-1.5 text-slate-50">Security</h1>
      <p className="mt-2 text-small text-slate-500">A stricter content security policy (it stops injected scripts) is running in report-only mode: nothing is blocked, but every browser tells us what it would have blocked.</p>

      <section className="glass-surface mt-6 p-5" aria-label="Is it safe to enforce?">
        <h2 className="text-body font-semibold text-slate-50">Is it safe to turn on?</h2>
        {rows.length === 0 ? (
          <p className="mt-2 text-small text-slate-300">No reports yet. Reports arrive as people use the site; check again after a few days of normal use.</p>
        ) : realRecent.length === 0 ? (
          <p className="mt-2 text-small text-slate-300">
            <span className="font-semibold text-signal-fg">Looking good.</span> No real findings in the last 3 days
            {watchedDays >= 3 ? ` (reports have been collected for ${watchedDays} days)` : `, but reports have only been collected for ${watchedDays} day${watchedDays === 1 ? "" : "s"}, so give it a few more`}. Tell me and I will turn enforcement on.
          </p>
        ) : (
          <p className="mt-2 text-small text-amber-300">
            {realRecent.length} real finding{realRecent.length === 1 ? "" : "s"} in the last 3 days (below). Turning enforcement on now would block {realRecent.length === 1 ? "it" : "them"} for visitors. Fix or allow {realRecent.length === 1 ? "it" : "them"} first.
          </p>
        )}
        <p className="mt-2 text-small text-slate-500">{noiseCount} report group{noiseCount === 1 ? "" : "s"} came from visitors&apos; own browser extensions or tools and can be ignored.</p>
        <div className="mt-3">
          <CspClearButton onClear={clearCspViolationsAction} />
        </div>
      </section>

      <section className="glass-surface mt-5 p-5" aria-label="Reports">
        <h2 className="text-body font-semibold text-slate-50">Reports</h2>
        {rows.length === 0 ? (
          <p className="mt-2 text-small text-slate-500">Nothing yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto" role="region" aria-label="Reports table" tabIndex={0}>
            <table className="w-full min-w-[40rem] text-left text-small">
              <thead>
                <tr className="text-slate-500">
                  <th scope="col" className="py-1 pr-3 font-medium">Rule</th>
                  <th scope="col" className="py-1 pr-3 font-medium">What was blocked</th>
                  <th scope="col" className="py-1 pr-3 font-medium">On page</th>
                  <th scope="col" className="py-1 pr-3 font-medium">Times</th>
                  <th scope="col" className="py-1 pr-3 font-medium">Last seen</th>
                  <th scope="col" className="py-1 font-medium">Verdict</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50/10 text-slate-200">
                {classified.map((r) => (
                  <tr key={r.id}>
                    <td className="py-2 pr-3 font-mono">{r.directive}</td>
                    <td className="py-2 pr-3 break-all">{r.blocked}</td>
                    <td className="py-2 pr-3 break-all">{r.page}</td>
                    <td className="py-2 pr-3 tabular-nums">{r.count}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">{when(r.lastSeenAt)}</td>
                    <td className={`py-2 ${r.noise ? "text-slate-500" : "text-amber-300"}`}>{r.noise ? "Browser extension, ignore" : "Look at this"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
