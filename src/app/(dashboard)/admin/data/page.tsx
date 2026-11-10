import { redirect } from "next/navigation";
import { intoParams } from "@/components/admin/SectionPills";

/** Data is a view of System now: this address opens it there, keeping the tab and search the link carried. */
export default async function Page(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await props.searchParams;
  redirect(`/admin/security?${intoParams(sp, { section: "data" })}`);
}
