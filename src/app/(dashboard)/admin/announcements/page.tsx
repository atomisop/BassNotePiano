import { redirect } from "next/navigation";

// Announcements now live inside the Messages tab. This keeps old links working.
export default function AdminAnnouncementsPage() {
  redirect("/admin/messages?tab=announcements");
}
