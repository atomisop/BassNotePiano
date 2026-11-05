import { notFound } from "next/navigation";
import { MotionPreview } from "./MotionPreview";

export const metadata = { title: "Motion preview", robots: { index: false } };

/** Dev-only preview of the revamp's shared motion pieces. 404s in production. */
export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <MotionPreview />;
}
