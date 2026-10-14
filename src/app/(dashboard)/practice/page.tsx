import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getFingerPracticeStatus } from "@/lib/fingerPractice";
import { WideLayout } from "@/components/layout/PageLayouts";
import { safePracticeNext } from "@/lib/fingerPracticeConstants";
import { PracticeClient } from "./PracticeClient";
import { practiceBeatAction } from "./actions";

export const metadata = { title: "Finger practice" };

export default async function PracticePage(props: { searchParams: Promise<{ next?: string }> }) {
  const searchParams = await props.searchParams;
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/practice");

  const [status, user] = await Promise.all([
    getFingerPracticeStatus(session.user.id),
    prisma.user.findUnique({ where: { id: session.user.id }, select: { primaryInstrument: true } }),
  ]);

  return (
    <WideLayout>
      <PracticeClient
        initialStatus={status}
        defaultInstrument={user?.primaryInstrument === "GUITAR" || user?.primaryInstrument === "BASS" ? "GUITAR" : "PIANO"}
        onBeat={practiceBeatAction}
        nextHref={safePracticeNext(searchParams.next)}
      />
    </WideLayout>
  );
}
