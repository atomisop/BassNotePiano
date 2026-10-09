import { NextResponse } from "next/server";
import { getBoolSetting } from "@/lib/siteSettings";

export const dynamic = "force-dynamic";

/** Tells the sign-up form whether to ask for a phone number. Nothing here is secret. */
export async function GET() {
  const phoneRequired = await getBoolSetting("phone.askAtSignup");
  return NextResponse.json({ phoneRequired }, { headers: { "Cache-Control": "no-store" } });
}
