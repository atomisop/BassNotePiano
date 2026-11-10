import { redirect } from "next/navigation";
import { intoParams } from "@/components/admin/SectionPills";

/** Staff is a view of the People page now: this address opens it there. */
export default async function Page(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await props.searchParams;
  redirect(`/admin/users?${intoParams(sp, { filter: "staff" })}`);
}
