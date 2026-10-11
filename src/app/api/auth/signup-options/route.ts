import { NextResponse } from "next/server";
import { getBoolSetting } from "@/lib/siteSettings";
import { phoneVerifyMode } from "@/lib/phoneVerification";

export const dynamic = "force-dynamic";

/** Tells the sign-up form whether to ask for a phone number, and whether a text code is really sent. Nothing here is secret. */
export async function GET() {
  const [phoneRequired, verifyBySms] = await Promise.all([getBoolSetting("phone.askAtSignup"), phoneVerifyMode()]);
  return NextResponse.json({ phoneRequired, verifyBySms }, { headers: { "Cache-Control": "no-store" } });
}
