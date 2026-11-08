import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { WideLayout } from "@/components/layout/PageLayouts";
import { getPianoBest } from "@/lib/piano/attempts";
import { WARM_UP } from "@/lib/piano/exercises";
import { PianoLesson } from "./PianoLesson";

export const metadata = { title: "Piano practice" };

export default async function PianoPracticePage() {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/practice/piano");
  return (
    <WideLayout>
      <PianoLesson initialBest={await getPianoBest(session.user.id, WARM_UP.id)} />
    </WideLayout>
  );
}
