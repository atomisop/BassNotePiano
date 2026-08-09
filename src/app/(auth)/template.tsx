/**
 * Animates the card when moving between login / register / forgot / reset /
 * verify. The shared logo header lives in (auth)/layout.tsx and so stays
 * still across those moves, which is the point — only the form changes.
 */
export default function AuthTemplate({ children }: { children: React.ReactNode }) {
  return <div className="page-enter w-full">{children}</div>;
}
