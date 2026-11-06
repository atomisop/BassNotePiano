/**
 * Removes secrets from an error report before it leaves for GlitchTip. Some page and API addresses carry a private link token in
 * the query string (the calendar feed, unsubscribe and emailed-link tags, reset links with an email), so addresses, the query
 * string, cookies, authorization headers and navigation breadcrumbs are cleaned, not only the request body.
 */
const SECRET_QUERY = /([?&](?:t|token|c|r|rm|u|email|code|key)=)[^&#\s]*/gi;

export function scrubUrl(url: string | undefined): string | undefined {
  return url?.replace(SECRET_QUERY, "$1[redacted]");
}

type Scrubbable = {
  request?: { url?: string; query_string?: unknown; cookies?: unknown; headers?: Record<string, string> };
  breadcrumbs?: { data?: Record<string, unknown> }[];
};

export function scrubEvent<T extends Scrubbable>(event: T): T {
  if (event.request) {
    event.request.url = scrubUrl(event.request.url);
    delete event.request.query_string;
    delete event.request.cookies;
    if (event.request.headers) {
      for (const name of Object.keys(event.request.headers)) {
        if (/^(cookie|authorization|x-ingest-secret|x-smoke-token)$/i.test(name)) delete event.request.headers[name];
      }
    }
  }
  for (const crumb of event.breadcrumbs ?? []) {
    if (!crumb.data) continue;
    for (const field of ["url", "to", "from"]) {
      const value = crumb.data[field];
      if (typeof value === "string") crumb.data[field] = scrubUrl(value);
    }
  }
  return event;
}
