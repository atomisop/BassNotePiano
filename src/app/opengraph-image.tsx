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
const INK = "#101012";
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

const logoDataUri = `data:image/png;base64,${readFileSync(path.join(process.cwd(), "src", "assets", "og-mark.png")).toString("base64")}`;

export default async function OpengraphImage() {
  const headline = "Ethiopian Scales, Rhythm & Chords";
  const supporting =
    "Spelled correctly in all twelve keys, with the native chords mapped for each one.TizitaBatiAnchihoyeAmbasselbassnotepiano.com" +
    SITE_NAME +
    SITE_NAME.toUpperCase();

  // The product now uses one family, Sora, for everything — no separate
  // display/body pairing to keep straight here, so both loads request the
  // same font at the two weights the card actually uses.
  const [soraBody, soraDisplay] = await Promise.all([
    loadGoogleFont("Sora", 400, supporting),
    loadGoogleFont("Sora", 700, headline + SITE_NAME.toUpperCase()),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          background: INK,
          overflow: "hidden",
        }}
      >
        {/* Warm glows pulled from the logo itself: brass-gold high on the
            right, deep olive low, so the card reads as the mark's own
            light rather than a generic dark slide. Plain circle gradients
            only (Satori's gradient grammar is a subset, see the build note
            this file used to carry). */}
        <div
          style={{
            position: "absolute",
            right: -120,
            top: -200,
            width: 820,
            height: 820,
            borderRadius: 999,
            backgroundImage: "radial-gradient(circle, rgba(214,178,98,0.40) 0%, rgba(214,178,98,0) 68%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            right: -60,
            bottom: -300,
            width: 880,
            height: 880,
            borderRadius: 999,
            backgroundImage: "radial-gradient(circle, rgba(112,90,32,0.55) 0%, rgba(150,120,50,0.20) 45%, rgba(112,90,32,0) 70%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: -240,
            bottom: -320,
            width: 700,
            height: 700,
            borderRadius: 999,
            backgroundImage: "radial-gradient(circle, rgba(245,245,245,0.10) 0%, rgba(245,245,245,0) 65%)",
          }}
        />

        {/* The badge, large, on the right. */}
        <div
          style={{
            position: "absolute",
            right: 56,
            top: 108,
            width: 414,
            height: 414,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
          <img src={logoDataUri} width={414} height={414} style={{ width: 414, height: 414 }} />
        </div>

        {/* Text column */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            width: 700,
            height: "100%",
            padding: "68px 0 64px 80px",
          }}
        >
          <div
            style={{
              display: "flex",
              fontFamily: soraDisplay ? "Sora" : undefined,
              fontSize: 21,
              letterSpacing: "0.28em",
              textTransform: "uppercase",
              color: PAPER,
              fontWeight: 700,
            }}
          >
            {SITE_NAME}
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                display: "flex",
                fontFamily: soraDisplay ? "Sora" : undefined,
                fontWeight: 700,
                fontSize: 72,
                lineHeight: 1.05,
                letterSpacing: "-0.03em",
                color: PAPER,
              }}
            >
              {headline}
            </div>
            <div
              style={{
                display: "flex",
                marginTop: 26,
                fontSize: 27,
                lineHeight: 1.45,
                color: MUTED,
                maxWidth: 600,
              }}
            >
              Spelled correctly in all twelve keys, with the native chords mapped for each one.
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingRight: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {["Tizita", "Bati", "Anchihoye", "Ambassel"].map((name) => (
                <div
                  key={name}
                  style={{
                    display: "flex",
                    padding: "9px 20px",
                    borderRadius: 999,
                    border: "1px solid rgba(245,245,245,0.22)",
                    background: "rgba(245,245,245,0.06)",
                    color: PAPER,
                    fontSize: 22,
                  }}
                >
                  {name}
                </div>
              ))}
            </div>
          </div>
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
