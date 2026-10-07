import { Prisma, type PrismaClient } from "@prisma/client";
import { BACKUP_SKIPPED_MODELS } from "@/lib/backupCore";

const PAGE = 2000;

/** Every table (except the skipped ones) as plain rows, read a page at a time. */
export async function exportAllTables(db: PrismaClient, pageSize = PAGE): Promise<Record<string, unknown[]>> {
  const tables: Record<string, unknown[]> = {};
  const delegates = db as unknown as Record<string, { findMany: (args: object) => Promise<unknown[]> }>;
  for (const model of Prisma.dmmf.datamodel.models) {
    if (BACKUP_SKIPPED_MODELS.has(model.name)) continue;
    const delegate = delegates[model.name.charAt(0).toLowerCase() + model.name.slice(1)];
    const rows: unknown[] = [];
    for (let skip = 0; ; skip += pageSize) {
      // Ordered by the first field (the id on every model here) so paging is stable.
      const page = await delegate.findMany({ skip, take: pageSize, orderBy: { [model.fields[0].name]: "asc" } });
      rows.push(...page);
      if (page.length < pageSize) break;
    }
    tables[model.name] = rows;
  }
  return tables;
}
