import { ImageResponse } from "next/og";
import { readFileSync } from "node:fs";
import path from "node:path";
import { SITE_NAME } from "@/lib/site";

// A file-based OG image: Next serves this at /opengraph-image and wires the
// correct absolute URL + dimensions into both the og: and twitter: tags, so
// nothing here has to be repeated in `metadata`.
export const runtime = "nodejs";
export const alt = `${SITE_NAME} — an interactive masterclass in the Ethiopian scale system`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Dark card for social: the card is competing for attention in a feed
// against mostly-white chrome, so it leads with the near-black ground and
// crisp white type — neutral rather than the app's own accent, since this
// card isn't a call-to-action and the app itself now reserves that accent
// for true CTAs only ("premium black and white" direction; see themes.css's
// own "Accent" comment for the full history of what that one accent has
// been over time).
const INK = "#1A1A1A";
const PAPER = "#F5F5F5";
const MUTED = "#999999";

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

const logoDataUri = `data:image/png;base64,${readFileSync(path.join(process.cwd(), "public", "logo-mark.png")).toString("base64")}`;

export default async function OpengraphImage() {
  const headline = "Ethiopian Scales, Rhythm & Chords";
  const supporting =
    "Spelled correctly in all twelve keys, with the native chords mapped for each one.TizitaBatiAnchihoyeAmbassel" +
    SITE_NAME;

  // The product now uses one family, Sora, for everything — no separate
  // display/body pairing to keep straight here, so both loads request the
  // same font at the two weights the card actually uses.
  const [soraBody, soraDisplay] = await Promise.all([
    loadGoogleFont("Sora", 400, supporting),
    loadGoogleFont("Sora", 700, headline),
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
          // A soft white bloom from the lower left, so the flat ink field
          // reads as a lit surface rather than a solid colour swatch —
          // neutral, not accent-tinted, same reasoning as above.
          //
          // `circle at …` rather than an explicit two-length size: Satori (the
          // renderer behind ImageResponse) implements only a subset of the CSS
          // gradient grammar, and `radial-gradient(1000px 620px at …)` fails
          // its parser with "Missing comma before color stops" — which surfaces
          // as a prerender error that fails the whole build, not a silent
          // style fallback.
          backgroundImage: `radial-gradient(circle at 8% 108%, rgba(245,245,245,0.16) 0%, rgba(245,245,245,0) 62%)`,
        }}
      >
        {/* Wordmark rail */}
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
          <img src={logoDataUri} width={64} height={64} style={{ width: 64, height: 64 }} />
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
              fontFamily: soraDisplay ? "Sora" : undefined,
              // Both registered Sora weights share one family name now
              // (see the `fonts` array below) — without this, Satori has
              // nothing to disambiguate 400 from 700 by and would default
              // to normal weight here.
              fontWeight: 700,
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
                border: `1px solid rgba(245,245,245,0.20)`,
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
      // Same family name, two weights — Satori matches on `weight`, so the
      // 700 registration is what `fontFamily: "Sora"` + this node's own
      // `fontSize`/no explicit weight resolves against for the headline,
      // while everything else (no `fontFamily` set) falls through to the
      // first entry, same "first font is the default face" rule as before.
      fonts: [
        ...(soraBody
          ? [{ name: "Sora", data: soraBody, style: "normal" as const, weight: 400 as const }]
          : []),
        ...(soraDisplay
          ? [{ name: "Sora", data: soraDisplay, style: "normal" as const, weight: 700 as const }]
          : []),
      ],
    },
  );
}
