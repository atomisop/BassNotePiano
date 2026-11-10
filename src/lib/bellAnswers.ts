// Requests a person answers with Accept or Decline right on the bell entry (a friend request, a parent link request, a group plan
// invitation). The notice records which request it is in its own link (`?answer=<id>`), so the bell can show the buttons and the
// tap still opens the right page for anyone who prefers the page. Pure, so it is tested and safe in the browser.

export type AnswerKind = "friend" | "parent" | "group";
export type AnswerState = "PENDING" | "ACCEPTED" | "DECLINED" | "GONE";

const PARAM = "answer";
const ID_SHAPE = /^[a-z0-9]{10,40}$/i;

const KIND_BY_TYPE: Record<string, AnswerKind> = {
  FRIEND_REQUEST_RECEIVED: "friend",
  PARENT_LINK_REQUEST: "parent",
  GROUP_INVITE: "group",
};

/** Which kind of request a notification type carries, or null when it carries none. */
export function answerKindFor(type: string): AnswerKind | null {
  return KIND_BY_TYPE[type] ?? null;
}

/** `base` with `?answer=<id>` added before any `#part`, keeping a query it already has. */
export function answerHref(base: string, id: string): string {
  const hashAt = base.indexOf("#");
  const path = hashAt === -1 ? base : base.slice(0, hashAt);
  const hash = hashAt === -1 ? "" : base.slice(hashAt);
  return `${path}${path.includes("?") ? "&" : "?"}${PARAM}=${encodeURIComponent(id)}${hash}`;
}

/** The request id a notice's link carries, or null (an older notice, or anything that does not look like an id). */
export function answerIdFrom(href: string | null | undefined): string | null {
  if (!href) return null;
  const query = href.split("#")[0].split("?")[1];
  if (!query) return null;
  const id = new URLSearchParams(query).get(PARAM);
  return id && ID_SHAPE.test(id) ? id : null;
}

/** The page a parent opens from their child's "move or skip this class" ask: the child's page with that class's move picker open. */
export function parentMoveHref(childId: string, bookingId: string): string {
  return `/parent/${encodeURIComponent(childId)}?move=${encodeURIComponent(bookingId)}`;
}

/** The words under a request that was already answered (here or on its own page). */
export function answeredLabel(state: AnswerState): string | null {
  if (state === "ACCEPTED") return "Accepted";
  if (state === "DECLINED") return "Declined";
  if (state === "GONE") return "No longer waiting";
  return null;
}
