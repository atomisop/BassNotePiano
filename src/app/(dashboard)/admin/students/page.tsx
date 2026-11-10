import { redirect } from "next/navigation";

// Class applications were removed (2026-11-09): the class form now just sends the person's details, which are listed on
// People > Contacts. This address stays so a link in an old email or notification still lands somewhere useful (searched to the
// person when the old link carried their email).
export default async function AdminStudentsPage(props: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await props.searchParams;
  const search = typeof q === "string" ? q.trim().slice(0, 200) : "";
  redirect(`/admin/users?filter=classform${search ? `&q=${encodeURIComponent(search)}` : ""}`);
}
