"use server";

import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export interface QuickFindPerson {
  id: string;
  name: string | null;
  email: string;
  banned: boolean;
}

/** The command menu's people search. Admin only; this check is the real boundary, the menu merely hides itself. */
export async function quickFindPeopleAction(query: string): Promise<QuickFindPerson[]> {
  const session = await getServerAuthSession();
  if (!session?.user || session.user.role !== "ADMIN") return [];
  const q = query.trim();
  if (q.length < 2 || q.length > 80) return [];
  const rows = await prisma.user.findMany({
    where: { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] },
    orderBy: { createdAt: "desc" },
    take: 6,
    select: { id: true, name: true, email: true, bannedAt: true },
  });
  return rows.map((r) => ({ id: r.id, name: r.name, email: r.email, banned: Boolean(r.bannedAt) }));
}
