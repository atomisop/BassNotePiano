import { LOGO_DIAMOND, LOGO_DRAW_MAP, LOGO_KEYS, LOGO_LETTERS, LOGO_MAIN, LOGO_RULES } from "@/lib/launchLogoPaths";

/**
 * The opening animation's logo (same 901 by 645 box as public/brand/lockup-cream.png, drawn as vector paths from it).
 * One thick line draws itself along the whole BNP mark, which is a single continuous line from the tip of the B's stem to the foot of the P:
 * a small gray picture (`LOGO_DRAW_MAP`, made with the paths) stores, for every pixel of the mark, how far along the line it lies (0 = the stem tip, 255 = the foot of the P),
 * and a filter turns that into a mask that opens along the line (SMIL, so it starts with the first frame). The tip of the line is orange and
 * settles into cream. Then the piano keys in the B come in, the name rises letter by letter in a wave, and the rule and the diamond finish it.
 * Everything runs on the one SMIL clock so the parts stay in step: the line 0 to 2.2s, keys from 1.5s, letters from 2.2s, rule and diamond from 3.1s.
 * Reduced motion shows the finished logo (`.bnp-logo-still`) and none of this.
 */
const DRAW_MS = 2200;
const SLOPE = 40;
const OFF = (SLOPE * 0.025).toFixed(2);

function Drawing({ id, lead }: { id: string; lead: number }) {
  // The image holds each pixel's distance along the line as a gray from 0 to 1 (g). The filter computes clamp(SLOPE * (progress - g)) as the
  // mask's strength: the transfer function sets it from g, and `intercept` (SLOPE * progress) is what the animation moves.
  const from = (-2 + lead * SLOPE).toFixed(2);
  const to = (SLOPE * 1.1 + lead * SLOPE).toFixed(2);
  return (
    <>
      <filter id={`bnp-draw-${id}`} filterUnits="userSpaceOnUse" x="0" y="0" width="901" height="645" colorInterpolationFilters="sRGB">
        <feComponentTransfer>
          <feFuncR type="linear" slope={-SLOPE} intercept={from}>
            <animate attributeName="intercept" dur={`${DRAW_MS}ms`} begin="0s" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines="0.5 0 0.25 1" values={`${from};${to}`} />
          </feFuncR>
        </feComponentTransfer>
        <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  1 0 0 0 0" />
      </filter>
      <mask id={`bnp-reveal-${id}`} maskUnits="userSpaceOnUse" x="0" y="0" width="901" height="645">
        <image href={LOGO_DRAW_MAP} x="0" y="0" width="901" height="645" filter={`url(#bnp-draw-${id})`} />
      </mask>
    </>
  );
}

const EASE = "0.23 1 0.32 1";

/** A piece that rises into place and fades in, on the SMIL clock. */
function Rise({ d, begin, dur, from }: { d: string; begin: number; dur: number; from: number }) {
  const t = { begin: `${begin}ms`, dur: `${dur}ms`, fill: "freeze" as const, calcMode: "spline" as const, keyTimes: "0;1", keySplines: EASE };
  return (
    <g opacity="0">
      <animate attributeName="opacity" values="0;1" {...t} />
      <g>
        <animateTransform attributeName="transform" type="translate" values={`0 ${from};0 0`} {...t} />
        <path d={d} />
      </g>
    </g>
  );
}

/** A rule that grows out from the end next to the diamond. */
function Rule({ d, originX, originY, begin }: { d: string; originX: number; originY: number; begin: number }) {
  const t = { begin: `${begin}ms`, dur: "560ms", fill: "freeze" as const, calcMode: "spline" as const, keyTimes: "0;1", keySplines: EASE };
  return (
    <g transform={`translate(${originX} ${originY})`} opacity="0">
      <set attributeName="opacity" to="1" begin={`${begin}ms`} fill="freeze" />
      <g>
        <animateTransform attributeName="transform" type="scale" values="0 1;1 1" {...t} />
        <path d={d} transform={`translate(${-originX} ${-originY})`} />
      </g>
    </g>
  );
}

export function LaunchLogo() {
  const DX = 450;
  const DY = 596;
  const t = { begin: "3100ms", dur: "520ms", fill: "freeze" as const, calcMode: "spline" as const, keyTimes: "0;1", keySplines: EASE };
  return (
    <svg className="bnp-logo" viewBox="0 0 901 645" aria-hidden focusable="false">
      <defs>
        <Drawing id="cream" lead={0} />
        <Drawing id="tip" lead={Number(OFF) / SLOPE} />
      </defs>
      <g className="bnp-logo-anim">
        {/* The line: orange at its tip (drawn a little ahead), cream behind it. */}
        <g mask="url(#bnp-reveal-tip)">
          <path d={LOGO_MAIN} fill="#FF8A4C" fillRule="evenodd" />
        </g>
        <g mask="url(#bnp-reveal-cream)">
          <path d={LOGO_MAIN} fill="#FBF1E6" fillRule="evenodd" />
        </g>
        <g fill="#FBF1E6" fillRule="evenodd">
          {LOGO_KEYS.map((d, i) => (
            <Rise key={i} d={d} begin={1500 + i * 110} dur={520} from={14} />
          ))}
          {LOGO_LETTERS.map((d, i) => (
            <Rise key={i} d={d} begin={2200 + i * 60} dur={640} from={22} />
          ))}
        </g>
        <g fill="#F5A623" fillRule="evenodd">
          <Rule d={LOGO_RULES[0]} originX={382} originY={598} begin={3200} />
          <Rule d={LOGO_RULES[1]} originX={518} originY={598} begin={3200} />
          <g transform={`translate(${DX} ${DY})`} opacity="0">
            <set attributeName="opacity" to="1" begin="3100ms" fill="freeze" />
            <g>
              <animateTransform attributeName="transform" type="rotate" values="-90;0" {...t} />
              <g>
                <animateTransform attributeName="transform" type="scale" values="0.2;1" {...t} />
                <path d={LOGO_DIAMOND} transform={`translate(${-DX} ${-DY})`} />
              </g>
            </g>
          </g>
        </g>
      </g>
      <g className="bnp-logo-still" fillRule="evenodd">
        <path d={LOGO_MAIN} fill="#FBF1E6" />
        {[...LOGO_KEYS, ...LOGO_LETTERS].map((d, i) => (
          <path key={i} d={d} fill="#FBF1E6" />
        ))}
        {[...LOGO_RULES, LOGO_DIAMOND].map((d, i) => (
          <path key={i} d={d} fill="#F5A623" />
        ))}
      </g>
    </svg>
  );
}
