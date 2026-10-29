import Link from "next/link";
import { ArrowRight } from "lucide-react";

/**
 * The roadmap on Home: a big picture card (a warm dusk sky over a row of piano keys, like the reference app's verse card) with the
 * roadmap's name, the scale you are on, how far you are, and Continue. The whole card opens the Roadmap screen. The artwork is the
 * same in both themes, so its text is always light.
 */
export function RoadmapCard({
  name,
  current,
  percent,
  completedScales,
  totalScales,
}: {
  name: string;
  current: { code: string; title: string } | null;
  percent: number;
  completedScales: number;
  totalScales: number;
}) {
  return (
    <Link
      href="/roadmap"
      aria-label={`Open your roadmap, ${name}. ${percent}% done.`}
      className="group relative block overflow-hidden rounded-card text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
    >
      <div aria-hidden className="absolute inset-0 bg-[linear-gradient(180deg,#e9824c_0%,#b5533a_38%,#4a2a3a_72%,#1d1a22_100%)]" />
      <RoadmapKeys />
      <div className="relative flex min-h-[15rem] flex-col p-5 md:min-h-[17rem] md:p-6">
        <p className="text-small font-medium text-white/80">Your roadmap</p>
        <p className="mt-1 text-[1.5rem] font-bold leading-tight">{name}</p>
        {current && (
          <p className="mt-1 text-body text-white/85">
            {current.code} · {current.title}
          </p>
        )}
        <div className="mt-auto pt-8">
          <div className="flex items-center justify-between text-small text-white/80">
            <span>
              {completedScales} of {totalScales} scales
            </span>
            <span className="tabular-nums">{percent}%</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/20">
            <div className="h-full rounded-full bg-white" style={{ width: `${percent}%` }} />
          </div>
          <span className="mt-4 inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-small font-semibold text-[#1d1a22] transition group-hover:gap-3">
            {percent > 0 ? "Continue" : "Start"}
            <ArrowRight aria-hidden className="h-4 w-4" />
          </span>
        </div>
      </div>
    </Link>
  );
}

/** A row of piano keys fading up from the bottom of the card, like a horizon. */
function RoadmapKeys() {
  const white = 14;
  const blackAfter = [0, 1, 3, 4, 5, 7, 8, 10, 11, 12];
  return (
    <svg aria-hidden viewBox="0 0 140 40" preserveAspectRatio="xMidYMax slice" className="absolute inset-x-0 bottom-0 h-[55%] w-full opacity-35">
      <defs>
        <linearGradient id="roadmap-keys-fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#fff" stopOpacity="1" />
        </linearGradient>
        <mask id="roadmap-keys-mask">
          <rect width="140" height="40" fill="url(#roadmap-keys-fade)" />
        </mask>
      </defs>
      <g mask="url(#roadmap-keys-mask)">
        {Array.from({ length: white }).map((_, i) => (
          <rect key={i} x={i * 10 + 0.4} y="4" width="9.2" height="36" rx="1" fill="#fff" fillOpacity="0.5" />
        ))}
        {blackAfter.map((i) => (
          <rect key={`b${i}`} x={i * 10 + 6.6} y="4" width="6.8" height="22" rx="0.8" fill="#1d1a22" />
        ))}
      </g>
    </svg>
  );
}
