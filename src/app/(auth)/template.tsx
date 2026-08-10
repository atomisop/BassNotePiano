/**
 * Animates the card when moving between login / register / forgot / reset /
 * verify. The shared logo header lives in (auth)/layout.tsx and so stays
 * still across those moves, which is the point — only the form changes.
 */
export default function AuthTemplate({ children }: { children: React.ReactNode }) {
  // Must re-centre, not just pass through. The parent <main> centres with
  // `flex justify-center`, which only worked while the card was its direct
  // flex child — this wrapper became the flex child instead, and being
  // w-full it consumed the whole row, leaving justify-center nothing to do
  // and the max-w-sm card pinned to the left edge. Keeping w-full (the card
  // sizes off it) plus its own centring restores it.
  return <div className="page-enter flex w-full justify-center">{children}</div>;
}
