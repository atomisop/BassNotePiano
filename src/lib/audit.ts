import { prisma } from "@/lib/prisma";

export interface AuditEntry {
  actorId?: string | null;
  actorEmail?: string | null;
  /** Short and stable, e.g. "payment.delete". */
  action: string;
  targetType?: string;
  targetId?: string;
  /** One readable line about what changed. */
  detail?: string;
}

/** Records who did what for money, access and role changes. Never throws: a failed log must not undo the action. */
export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: entry.actorId ?? null,
        actorEmail: entry.actorEmail ?? null,
        action: entry.action,
        targetType: entry.targetType ?? null,
        targetId: entry.targetId ?? null,
        detail: entry.detail?.slice(0, 500) ?? null,
      },
    });
  } catch (err) {
    console.error("Audit log failed (non-blocking):", err);
  }
}

export async function listAudit(limit = 40) {
  return prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: limit });
}
