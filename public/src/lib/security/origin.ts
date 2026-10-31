/**
 * CSRF protection for Route Handlers that change state.
 *
 * Server Actions already verify the Origin header in Next.js. Route Handlers
 * do not, so every state-changing handler calls isSameOriginRequest() and
 * rejects the request when it returns false. The check FAILS CLOSED: if the
 * browser sends neither Origin nor Sec-Fetch-Site, the request is refused.
 */
export interface OriginCheckInput {
  method: string;
  origin: string | null;
  secFetchSite: string | null;
  host: string | null;
  allowedOrigins: readonly string[];
}

export function isSameOriginRequest(input: OriginCheckInput): boolean {
  const method = input.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return true;

  if (input.origin) {
    let origin: URL;
    try {
      origin = new URL(input.origin);
    } catch {
      return false;
    }
    const normalised = origin.origin;
    if (input.allowedOrigins.includes(normalised)) return true;
    // Same host as the request itself (covers Vercel preview deployments).
    if (input.host && origin.host === input.host) return true;
    return false;
  }

  // Some privacy tools strip Origin; modern browsers still send Sec-Fetch-Site.
  if (input.secFetchSite) return input.secFetchSite === "same-origin";

  return false;
}

export function originCheckFromRequest(request: Request, allowedOrigins: readonly string[]) {
  return isSameOriginRequest({
    method: request.method,
    origin: request.headers.get("origin"),
    secFetchSite: request.headers.get("sec-fetch-site"),
    host: request.headers.get("x-forwarded-host") ?? request.headers.get("host"),
    allowedOrigins,
  });
}
