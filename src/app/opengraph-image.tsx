import { ImageResponse } from "next/og";
import { SITE_NAME } from "@/lib/site";

// A file-based OG image: Next serves this at /opengraph-image and wires the
// correct absolute URL + dimensions into both the og: and twitter: tags, so
// nothing here has to be repeated in `metadata`.
export const runtime = "nodejs";
export const alt = `${SITE_NAME} — an interactive masterclass in the Ethiopian kiñit system`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Editorial Paper inverted for social: the card is competing for attention in
// a feed against mostly-white chrome, so it leads with the dark ink ground and
// the rust accent rather than the paper ground the app itself uses.
const INK = "#1A150F";
const PAPER = "#FAF6EC";
const RUST = "#C2691F";
const MUTED = "#A9A093";

/**
 * Satori (which backs ImageResponse) cannot use a CSS-declared webfont — it
 * needs the actual font binary, and it does not support woff2. Requesting the
 * Google Fonts stylesheet with an ancient Safari UA is what makes the API
 * serve a plain TTF URL instead of woff2.
 *
 * Wrapped in try/catch on purpose: this runs at build time, and a font CDN
 * hiccup should degrade the card to the bundled default face, never fail the
 * whole deploy over a social image.
 */
async function loadGoogleFont(
  family: string,
  weight: number,
  text: string,
): Promise<ArrayBuffer | null> {
  try {
    const query = `${family.replace(/ /g, "+")}:wght@${weight}`;
    const cssUrl = `https://fonts.googleapis.com/css2?family=${query}&text=${encodeURIComponent(text)}`;
    const css = await fetch(cssUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_6_8) AppleWebKit/533.20.25 (KHTML, like Gecko) Version/5.0.4 Safari/533.20.27",
      },
    }).then((res) => (res.ok ? res.text() : ""));

    const fontUrl = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)?.[1];
    if (!fontUrl) return null;

    const res = await fetch(fontUrl);
    return res.ok ? await res.arrayBuffer() : null;
  } catch {
    return null;
  }
}

export default async function OpengraphImage() {
  const headline = "Ethiopian Scales, Rhythm & Chords";
  const supporting =
    "Spelled correctly in all twelve keys, with the native chords mapped for each one.TizitaBatiAnchihoyeAmbassel" +
    SITE_NAME;

  // The product's type pairing is Playfair Display for display and Inter for
  // everything else. Satori treats the FIRST entry in `fonts` as the default
  // face for any node that doesn't name one, so Inter has to lead — otherwise
  // the supporting copy and the kiñit chips silently render in Playfair too,
  // which reads as one undifferentiated serif block instead of the pairing.
  const [inter, playfair] = await Promise.all([
    loadGoogleFont("Inter", 400, supporting),
    loadGoogleFont("Playfair Display", 700, headline),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: INK,
          padding: "72px 80px",
          // A warm bloom from the lower left, so the flat ink field reads as a
          // lit surface rather than a solid colour swatch.
          //
          // `circle at …` rather than an explicit two-length size: Satori (the
          // renderer behind ImageResponse) implements only a subset of the CSS
          // gradient grammar, and `radial-gradient(1000px 620px at …)` fails
          // its parser with "Missing comma before color stops" — which surfaces
          // as a prerender error that fails the whole build, not a silent
          // style fallback.
          backgroundImage: `radial-gradient(circle at 8% 108%, rgba(194,105,31,0.32) 0%, rgba(194,105,31,0) 62%)`,
        }}
      >
        {/* Wordmark rail */}
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ width: 40, height: 3, background: RUST }} />
          <div
            style={{
              fontSize: 23,
              letterSpacing: "0.24em",
              textTransform: "uppercase",
              color: PAPER,
              fontWeight: 600,
            }}
          >
            {SITE_NAME}
          </div>
        </div>

        {/* The headline carries the card. Everything else is support. */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              fontFamily: playfair ? "Playfair" : undefined,
              fontSize: 92,
              lineHeight: 1.04,
              letterSpacing: "-0.03em",
              color: PAPER,
              maxWidth: 960,
            }}
          >
            {headline}
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 30,
              fontSize: 29,
              lineHeight: 1.45,
              color: MUTED,
              maxWidth: 810,
            }}
          >
            Spelled correctly in all twelve keys, with the native chords mapped for each one.
          </div>
        </div>

        {/* The four kiñits, set as a specimen line — the actual differentiator,
            and the part a reader recognises at a glance. */}
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {["Tizita", "Bati", "Anchihoye", "Ambassel"].map((name) => (
            <div
              key={name}
              style={{
                display: "flex",
                padding: "11px 24px",
                borderRadius: 999,
                border: `1px solid rgba(250,246,236,0.20)`,
                color: PAPER,
                fontSize: 25,
              }}
            >
              {name}
            </div>
          ))}
        </div>
      </div>
    ),
    {
      ...size,
      // Order matters — see the comment where these are loaded.
      fonts: [
        ...(inter
          ? [{ name: "Inter", data: inter, style: "normal" as const, weight: 400 as const }]
          : []),
        ...(playfair
          ? [{ name: "Playfair", data: playfair, style: "normal" as const, weight: 700 as const }]
          : []),
      ],
    },
  );
}
