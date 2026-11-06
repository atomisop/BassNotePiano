import { getServerAuthSession } from "@/lib/auth";
import { isOwnerEmail } from "@/lib/adminNotifications";
import { listScholarshipCodes } from "@/lib/scholarships";
import { formatScholarshipCode, scholarshipStatus } from "@/lib/scholarshipRules";
import { creditsLabelFromStored, storedToCredits } from "@/lib/classCreditPricing";
import { ScholarshipManager, type ScholarshipRow } from "@/components/admin/ScholarshipManager";

export const metadata = { title: "Admin: Scholarships" };

export default async function AdminScholarshipsPage() {
  const session = await getServerAuthSession();
  if (!isOwnerEmail(session?.user.email)) {
    return (
      <div>
        <h1 className="sr-only">Scholarships</h1>
        <p className="mt-2 text-small text-slate-500">Only the owner can manage scholarship codes.</p>
      </div>
    );
  }
  const now = new Date();
  const rows: ScholarshipRow[] = (await listScholarshipCodes()).map((r) => ({
    id: r.id,
    code: formatScholarshipCode(r.code),
    email: r.assignedEmail,
    classes: storedToCredits(r.credits),
    classesLabel: creditsLabelFromStored(r.credits),
    note: r.note,
    status: scholarshipStatus(r, now),
    expiresAt: r.expiresAt?.toISOString() ?? null,
    claimedAt: r.claimedAt?.toISOString() ?? null,
    claimedBy: r.claimedBy ? (r.claimedBy.name ?? r.claimedBy.email) : null,
    createdAt: r.createdAt.toISOString(),
  }));
  return (
    <div>
      <h1 className="sr-only">Scholarships</h1>
      <ScholarshipManager rows={rows} />
    </div>
  );
}
