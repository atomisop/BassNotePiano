import { getServerAuthSession } from "@/lib/auth";
import { isOwnerEmail } from "@/lib/adminNotifications";
import { listScholarshipCodes } from "@/lib/scholarships";
import { formatScholarshipCode, scholarshipStatus } from "@/lib/scholarshipRules";
import { ScholarshipManager, type ScholarshipRow } from "@/components/admin/ScholarshipManager";
import { Hint } from "@/components/ui/Hint";

export async function ScholarshipsView() {
  const session = await getServerAuthSession();
  if (!isOwnerEmail(session?.user.email)) {
    return (
      <div>
        <h1 className="sr-only">Scholarships<Hint className="ml-1.5">Only the owner can manage scholarship codes.</Hint></h1>
      </div>
    );
  }
  const now = new Date();
  const rows: ScholarshipRow[] = (await listScholarshipCodes()).map((r) => ({
    id: r.id,
    code: formatScholarshipCode(r.code),
    email: r.assignedEmail,
    percent: r.percent,
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
