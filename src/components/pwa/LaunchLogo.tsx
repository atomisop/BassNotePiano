import { LOGO_BANDS, LOGO_DIAMOND, LOGO_KEYS, LOGO_LETTERS, LOGO_RULES } from "@/lib/launchLogoPaths";

/**
 * The opening animation's logo (same 901 by 645 box as public/brand/lockup-cream.png, drawn as vector paths from it).
 * One thick line draws itself along the whole BNP mark, which is a single continuous line from the tip of the B's stem to the foot of the P.
 * The mark is cut into slim slices in the order along that line (`LOGO_BANDS`, each with the moment it appears); every slice fades in a
 * little after the one before it, orange first and settling into cream, so the line seems to be drawn by an orange tip. Then the piano keys in
 * the B come in, the name rises letter by letter in a wave, and the rule and the diamond finish it.
 *
 * Plain CSS animation on plain paths (no filters, masks or SMIL), because the installed iPhone app runs Safari's engine, which does not
 * animate those the way other browsers do. All times scale with `--bnp-slow` (1 normally; `?slow=4` on a splash preview slows it down).
 * Timings: line 0 to 2.2s, keys from 1.5s, letters from 2.2s, diamond 3.1s, rule 3.2s (`.bnp-logo-*` in globals.css).
 * Reduced motion shows the finished logo (`.bnp-logo-still`) and none of this.
 */
const after = (ms: number) => ({ animationDelay: `calc(${ms}ms * var(--bnp-slow, 1))` });

export function LaunchLogo() {
  return (
    <svg className="bnp-logo" viewBox="0 0 901 645" aria-hidden focusable="false">
      <g className="bnp-logo-anim" fillRule="evenodd">
        <g>
          {LOGO_BANDS.map(([d, ms], i) => (
            <path key={i} d={d} className="bnp-logo-band" style={after(ms)} />
          ))}
        </g>
        <g fill="#FBF1E6">
          {LOGO_KEYS.map((d, i) => (
            <path key={i} d={d} className="bnp-logo-key" style={after(1500 + i * 110)} />
          ))}
          {LOGO_LETTERS.map((d, i) => (
            <path key={i} d={d} className="bnp-logo-letter" style={after(2200 + i * 60)} />
          ))}
        </g>
        <g fill="#F5A623">
          <path d={LOGO_RULES[0]} className="bnp-logo-rule bnp-logo-rule-l" style={after(3200)} />
          <path d={LOGO_RULES[1]} className="bnp-logo-rule bnp-logo-rule-r" style={after(3200)} />
          <path d={LOGO_DIAMOND} className="bnp-logo-diamond" style={after(3100)} />
        </g>
      </g>
      <g className="bnp-logo-still" fillRule="evenodd">
        {LOGO_BANDS.map(([d], i) => (
          <path key={i} d={d} fill="#FBF1E6" />
        ))}
        {[...LOGO_KEYS, ...LOGO_LETTERS].map((d, i) => (
          <path key={`k${i}`} d={d} fill="#FBF1E6" />
        ))}
        {[...LOGO_RULES, LOGO_DIAMOND].map((d, i) => (
          <path key={`r${i}`} d={d} fill="#F5A623" />
        ))}
      </g>
    </svg>
  );
}
