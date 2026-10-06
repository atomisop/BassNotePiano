import { redirect } from "next/navigation";

// Progress now lives inside People. This keeps old links working.
export default function AdminProgressPage() {
  redirect("/admin/users?filter=approval");
}
