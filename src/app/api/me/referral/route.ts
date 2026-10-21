import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import { getReferralSummary } from "@/lib/referrals";
import { REFERRAL_MONTHS, REFERRAL_PERCENT } from "@/lib/referralRules";

export const dynamic = "force-dynamic";

/** The signed-in person's invite link and how many friends joined. */
export async function GET() {
  const session = await getServerAuthSession();
  if (!session?.user?.id) return NextResponse.json({ error: "Not signed in." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const summary = await getReferralSummary(session.user.id);
  const origin = (process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/$/, "");
  return NextResponse.json(
    { ...summary, link: `${origin}/register?ref=${summary.code}`, percent: REFERRAL_PERCENT, months: REFERRAL_MONTHS },
    { headers: { "Cache-Control": "no-store" } },
  );
}
