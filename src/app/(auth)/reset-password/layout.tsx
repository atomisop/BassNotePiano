import type { ReactNode } from "react";

// The page itself is a client component, which cannot set a title, so this wrapper does.
export const metadata = { title: "Reset password" };

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
