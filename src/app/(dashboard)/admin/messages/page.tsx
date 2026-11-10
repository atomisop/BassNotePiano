import { redirect } from "next/navigation";
import { intoParams } from "@/components/admin/SectionPills";

/** Messages is a view of the Inbox now: this address opens it there, keeping the tab and recipients the link carried. */
export default async function Page(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await props.searchParams;
  redirect(`/admin/support?${intoParams(sp, { section: "messages" })}`);
}
