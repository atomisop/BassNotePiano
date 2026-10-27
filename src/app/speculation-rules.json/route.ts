// Speculation Rules: tells Chrome which pages it may fully load in a hidden tab before they are tapped, so the move is instant.
// Only the main navigation (the dock and the sidebar mark their links data-prerender) and only when the person hovers or presses
// toward one (eagerness "moderate"). Served as a file, not an inline <script>, so the strict content security policy is untouched.
// Never lists a page whose opening changes anything (a mail message marks itself read, a chat marks messages read).
export const dynamic = "force-static";

export function GET() {
  const rules = {
    prerender: [
      {
        where: { and: [{ selector_matches: "a[data-prerender]" }, { not: { href_matches: "/api/*" } }] },
        eagerness: "moderate",
      },
    ],
  };
  return new Response(JSON.stringify(rules), {
    headers: { "Content-Type": "application/speculationrules+json", "Cache-Control": "public, max-age=3600" },
  });
}
