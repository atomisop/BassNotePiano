import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { getLessonCredits, getUserBookings } from "@/lib/lessons";
import { LessonsClient } from "./LessonsClient";

export default async function LessonsPage() {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/lessons");

  const [credits, bookings] = await Promise.all([
    getLessonCredits(session.user.id),
    getUserBookings(session.user.id),
  ]);

  return (
    <LessonsClient
      initialCredits={credits}
      initialBookings={bookings.map((b) => ({
        id: b.id,
        type: b.type,
        scheduledAt: b.scheduledAt.toISOString(),
        status: b.status,
        notes: b.notes,
        canceledReason: b.canceledReason,
      }))}
    />
  );
}
