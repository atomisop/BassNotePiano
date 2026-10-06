"use server";

import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { recordPracticeBeat, type FingerPracticeStatus } from "@/lib/fingerPractice";

/** One heartbeat of the practice timer. The server decides how much time it counts. */
export async function practiceBeatAction(): Promise<FingerPracticeStatus & { justCompleted: boolean }> {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/practice");
  return recordPracticeBeat(session.user.id);
}
