import { redirect } from "next/navigation";
import { intoParams } from "@/components/admin/SectionPills";

/** Today is a view of Schedule now: this address opens it there, on the day the link carried. */
export default async function Page(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await props.searchParams;
  redirect(`/admin/schedule?${intoParams(sp, { view: "TODAY" })}`);
}
