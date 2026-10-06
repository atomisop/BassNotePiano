import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getFingerPracticeStatus } from "@/lib/fingerPractice";
import { WideLayout } from "@/components/layout/PageLayouts";
import { PracticeClient } from "./PracticeClient";
import { practiceBeatAction } from "./actions";

export default async function PracticePage() {
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
      />
    </WideLayout>
  );
}
