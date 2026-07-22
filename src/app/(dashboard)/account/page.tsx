import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AccountSettings } from "./AccountSettings";

export default async function AccountPage() {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/account");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, email: true, image: true },
  });
  if (!user) redirect("/login");

  return <AccountSettings email={user.email} initialName={user.name} initialImage={user.image} />;
}
