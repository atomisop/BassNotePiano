import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { AboutClient } from "./AboutClient";

export const metadata = { title: "About" };

export default async function AboutPage() {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/about");

  return <AboutClient />;
}
