import { notFound, redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { getSupportThread, listMentionableAdmins } from "@/lib/support";
import { SupportThreadView } from "@/components/admin/SupportThreadView";

const FILTER_PARAMS = new Set(["open", "resolved", "all", "mine"]);

export const metadata = { title: "Admin: Support thread" };

export default async function SupportThreadPage(
  props: {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ filter?: string; source?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const session = await getServerAuthSession();
  // The admin layout already redirects non-admins; this keeps the page safe on its own too.
  if (session?.user?.role !== "ADMIN") redirect("/dashboard");
  const [detail, admins] = await Promise.all([getSupportThread(params.id), listMentionableAdmins()]);
  if (!detail) notFound();

  // Back returns to the list this was opened from: same tab, same filter.
  const filter = FILTER_PARAMS.has(searchParams.filter ?? "") ? searchParams.filter : null;
  const query = [
    detail.thread.source === "EMAIL" && filter !== "mine" ? "source=email" : null,
    filter && filter !== "open" ? `filter=${filter}` : null,
  ]
    .filter(Boolean)
    .join("&");

  return (
    <SupportThreadView
      key={detail.thread.id}
      initial={detail}
      admins={admins}
      currentAdminId={session?.user?.id ?? ""}
      backHref={`/admin/support${query ? `?${query}` : ""}`}
    />
  );
}
