import { prisma } from "@/lib/prisma";

/** The best scholarship percent each account holds (0 for none), for pricing a group on the server. One query, whatever the size. */
export async function scholarshipPercentsFor(userIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>(userIds.map((id) => [id, 0]));
  if (userIds.length === 0) return out;
  const rows = await prisma.scholarshipCode.groupBy({
    by: ["claimedById"],
    where: { claimedById: { in: userIds }, claimedAt: { not: null }, revokedAt: null },
    _max: { percent: true },
  });
  for (const row of rows) if (row.claimedById) out.set(row.claimedById, row._max.percent ?? 0);
  return out;
}
