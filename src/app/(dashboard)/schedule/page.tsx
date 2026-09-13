import { redirect } from "next/navigation";

/**
 * This screen now lives at /lessons (see that page's own comment): a
 * Payment Plan subscriber sees it right there instead of getting sent
 * somewhere else, since that redirect read as "you're blocked from
 * Lessons" when really it's just self-service ad hoc booking that's
 * blocked, not the tab itself. Old links here (the TopBar icon used to
 * point at /schedule, bookmarks, anything cached) still land somewhere
 * real instead of a dead route.
 */
export default function SchedulePage() {
  redirect("/lessons");
}
