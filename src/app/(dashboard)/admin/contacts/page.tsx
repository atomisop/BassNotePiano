import { redirect } from "next/navigation";

/** Contacts and Accounts are one page now (People). Old links land on the right view of it. */
export default async function AdminContactsPage(props: { searchParams: Promise<{ q?: string; show?: string }> }) {
  const { q = "", show = "" } = await props.searchParams;
  const filter = show.toLowerCase() === "application" ? "classform" : show.toLowerCase() === "added" ? "added" : "";
  const params = new URLSearchParams();
  if (filter) params.set("filter", filter);
  if (q) params.set("q", q);
  const query = params.toString();
  redirect(`/admin/users${query ? `?${query}` : ""}`);
}
