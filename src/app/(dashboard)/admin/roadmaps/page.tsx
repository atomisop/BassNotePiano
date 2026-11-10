import { redirect } from "next/navigation";
import { intoParams } from "@/components/admin/SectionPills";

/** Roadmaps is part of another page now: this address opens it there, keeping any filters the link carried. */
export default async function Page(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await props.searchParams;
  redirect(`/admin/lessons?${intoParams(sp, { section: "roadmaps" })}`);
}
