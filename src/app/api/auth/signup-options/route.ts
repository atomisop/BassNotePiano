import { NextResponse } from "next/server";
import { getBoolSetting } from "@/lib/siteSettings";
import { smsAvailable } from "@/lib/sms";

export const dynamic = "force-dynamic";

/** Tells the sign-up form whether to ask for a phone number. Nothing here is secret. */
export async function GET() {
  const phoneRequired = smsAvailable() && (await getBoolSetting("signup.requirePhone"));
  return NextResponse.json({ phoneRequired }, { headers: { "Cache-Control": "no-store" } });
}
