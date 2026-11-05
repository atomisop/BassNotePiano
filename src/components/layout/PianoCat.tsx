/**
 * The pull-to-refresh mascot: a pixel cat in headphones that dances while the page refreshes (the way Claude's pixel crab does).
 * Drawn from a small character grid so every pixel lands on the grid; `o` is the cat, `h` the headphones, `d` the eyes, `p` the nose.
 * The dance is CSS (`.ptr-cat*` in globals.css): the body sways and hops on two beats, the paws swap, a note floats up. While you are
 * still pulling it stands and sways gently; reduced motion gets it standing still.
 */
const ROWS = [
  "..oo......oo..",
  "hooooooooooooh",
  "hooooooooooooh",
  "hoooDooooDoooh",
  "hooooooooooooh",
  ".ooooppppoooo.",
  "..oooooooooo..",
  "..oooooooooo..",
  ".oooooooooooo.",
  ".oo.oooooo.oo.",
  ".oo........oo.",
];

const COLORS: Record<string, string> = {
  o: "rgb(var(--signal))",
  h: "rgb(var(--c-s-50))",
  D: "rgb(var(--signal-ink))",
  p: "rgb(var(--signal-ink))",
};

const PIXEL = 4;

export function PianoCat({ size = 56 }: { size?: number }) {
  const cols = ROWS[0].length;
  const rows = ROWS.length;
  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${(cols + 6) * PIXEL} ${(rows + 3) * PIXEL}`}
      width={size}
      height={(size * (rows + 3)) / (cols + 6)}
      shapeRendering="crispEdges"
      className="ptr-cat overflow-visible"
    >
      <g className="ptr-cat-body" transform={`translate(${3 * PIXEL} ${3 * PIXEL})`}>
        {ROWS.map((row, y) =>
          [...row].map((ch, x) =>
            COLORS[ch] ? (
              <rect
                key={`${x}-${y}`}
                x={x * PIXEL}
                y={y * PIXEL}
                width={PIXEL}
                height={PIXEL}
                fill={COLORS[ch]}
                className={y >= 9 ? (x < 7 ? "ptr-cat-paw-a" : "ptr-cat-paw-b") : undefined}
              />
            ) : null,
          ),
        )}
      </g>
      {/* A note that floats up beside the cat. */}
      <g className="ptr-cat-note" fill="rgb(var(--c-s-50))">
        <rect x={(cols + 2) * PIXEL} y={2 * PIXEL} width={PIXEL} height={4 * PIXEL} />
        <rect x={(cols + 1) * PIXEL} y={5 * PIXEL} width={2 * PIXEL} height={PIXEL} />
        <rect x={(cols + 3) * PIXEL} y={2 * PIXEL} width={2 * PIXEL} height={PIXEL} />
      </g>
    </svg>
  );
}
