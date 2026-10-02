import type { Metadata } from "next";
import { DesignSystemPreview } from "./DesignSystemPreview";

export const metadata: Metadata = { title: "Design system" };

/**
 * Admin-only living reference for the redesign's design system (STEP 2).
 * Not linked from the admin nav on purpose; it is a working tool for
 * reviewing tokens and components, not a page students or staff need.
 * Admin access is enforced by admin/layout.tsx like every other admin page.
 */
export default function DesignSystemPage() {
  return <DesignSystemPreview />;
}
