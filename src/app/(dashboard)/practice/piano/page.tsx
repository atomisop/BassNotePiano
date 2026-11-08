import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { WideLayout } from "@/components/layout/PageLayouts";
import { PianoLesson } from "./PianoLesson";

export const metadata = { title: "Piano practice" };

export default async function PianoPracticePage() {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/practice/piano");
  return (
    <WideLayout>
      <PianoLesson />
    </WideLayout>
  );
}
