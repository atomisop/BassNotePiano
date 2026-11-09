import { redirect } from "next/navigation";

// Class applications were removed (2026-11-09): the class form now just sends the person's details, which are listed on
// People > Contacts. This address stays so a link in an old email or notification still lands somewhere useful.
export default function AdminStudentsPage() {
  redirect("/admin/contacts?show=application");
}
