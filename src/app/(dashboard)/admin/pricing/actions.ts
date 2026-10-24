"use server";

import { revalidatePath } from "next/cache";
import { getServerAuthSession } from "@/lib/auth";
import { isOwnerEmail } from "@/lib/adminNotifications";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getAllSettings, saveSetting } from "@/lib/siteSettings";
import { SETTING_BY_KEY } from "@/lib/siteSettingsDefs";
import { AccountDiscountError, clearAccountDiscount, setAccountDiscount } from "@/lib/accountDiscounts";

// Server Actions are separate endpoints the admin layout never guards, so this is the real check. Prices and discounts are the owner's.
async function requireOwner() {
  const session = await getServerAuthSession();
  if (!session?.user || session.user.role !== "ADMIN" || !isOwnerEmail(session.user.email)) throw new Error("Only the owner can change prices.");
  return session.user;
}

export type PricingFormValues = {
  "pricing.monthlyPlanDollars": number;
  "pricing.term3DiscountPercent": number;
  "pricing.term6DiscountPercent": number;
  "pricing.familyDiscountPercent": number;
  "pricing.extraClassPriceDollars": number;
  "payments.fifthClassPriceDollars": number;
};
const PRICING_KEYS = [
  "pricing.monthlyPlanDollars",
  "pricing.term3DiscountPercent",
  "pricing.term6DiscountPercent",
  "pricing.familyDiscountPercent",
  "pricing.extraClassPriceDollars",
  "payments.fifthClassPriceDollars",
] as const;

type Ok<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (err: unknown, fallback: string): { ok: false; error: string } => ({ ok: false, error: err instanceof Error ? err.message : fallback });

/** Saves the plan prices. Every value is checked against its own limits first, so either all of them save or none do. */
export async function savePricingAction(values: PricingFormValues): Promise<Ok> {
  try {
    const admin = await requireOwner();
    const before = await getAllSettings();
    const changes: string[] = [];
    for (const key of PRICING_KEYS) {
      const def = SETTING_BY_KEY[key];
      const value = values[key];
      if (!def || def.type !== "number") throw new Error("Unknown price.");
      if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) throw new Error(`${def.label}: enter a whole number.`);
      if (value < def.min || value > def.max) throw new Error(`${def.label}: must be between ${def.min} and ${def.max}.`);
    }
    for (const key of PRICING_KEYS) {
      const def = SETTING_BY_KEY[key];
      if (before.get(key) !== values[key]) {
        await saveSetting(key, values[key]);
        changes.push(`${def.label} ${String(before.get(key))} to ${values[key]}`);
      }
    }
    if (changes.length > 0) {
      await logAudit({ actorId: admin.id, actorEmail: admin.email, action: "pricing.update", targetType: "setting", detail: changes.join("; ") });
    }
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    return fail(err, "Could not save the prices.");
  }
}

export interface DiscountCandidate {
  id: string;
  name: string | null;
  email: string;
  discountPercent: number;
  /** Their running solo plan, if any: what a bill is now, and what it is before any discount. */
  plan: { monthlyCents: number; listCents: number; family: boolean } | null;
}

/** Finds accounts by name or email for the discount picker. Admins are left out (they pay for no plan). */
export async function searchDiscountCandidatesAction(query: string): Promise<DiscountCandidate[]> {
  try {
    await requireOwner();
  } catch {
    return [];
  }
  const q = query.trim();
  if (q.length < 2 || q.length > 80) return [];
  const rows = await prisma.user.findMany({
    where: { role: "STUDENT", bannedAt: null, OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] },
    orderBy: { createdAt: "desc" },
    take: 8,
    select: {
      id: true,
      name: true,
      email: true,
      accountDiscount: { select: { percent: true } },
      paymentPlans: { where: { status: "ACTIVE" }, orderBy: { createdAt: "desc" }, take: 1, select: { installmentAmountCents: true, listAmountCents: true, familyGroupId: true } },
    },
  });
  return rows.map((r) => {
    const plan = r.paymentPlans[0];
    return {
      id: r.id,
      name: r.name,
      email: r.email,
      discountPercent: r.accountDiscount?.percent ?? 0,
      plan: plan ? { monthlyCents: plan.installmentAmountCents, listCents: plan.listAmountCents ?? plan.installmentAmountCents, family: plan.familyGroupId !== null } : null,
    };
  });
}

export async function setAccountDiscountAction(userId: string, percent: number, note: string): Promise<Ok<{ message: string }>> {
  try {
    const admin = await requireOwner();
    const result = await setAccountDiscount({ userId, percent, note, actor: { id: admin.id, email: admin.email ?? null } });
    revalidatePath("/", "layout");
    const message = result.planChange && result.planChange.fromCents !== result.planChange.toCents
      ? `${percent}% off saved. Their price per payment is now ${(result.planChange.toCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })} and they were told.`
      : `${percent}% off saved. It applies when they start or change a plan.`;
    return { ok: true, message };
  } catch (err) {
    return err instanceof AccountDiscountError ? { ok: false, error: err.message } : fail(err, "Could not save the discount.");
  }
}

export async function clearAccountDiscountAction(userId: string): Promise<Ok<{ message: string }>> {
  try {
    const admin = await requireOwner();
    const result = await clearAccountDiscount({ userId, actor: { id: admin.id, email: admin.email ?? null } });
    revalidatePath("/", "layout");
    const message = result.planChange && result.planChange.fromCents !== result.planChange.toCents
      ? `Discount removed. Their price per payment is back to ${(result.planChange.toCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })} and they were told.`
      : "Discount removed.";
    return { ok: true, message };
  } catch (err) {
    return err instanceof AccountDiscountError ? { ok: false, error: err.message } : fail(err, "Could not remove the discount.");
  }
}
