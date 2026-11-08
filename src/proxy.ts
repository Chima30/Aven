import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isAuthPage, isProtectedPath } from "@/lib/auth/routes";
import { buildCsp, createNonce } from "@/lib/security/csp";
import { DEFAULT_AFTER_SIGN_IN } from "@/lib/security/redirects";

/**
 * Runs before matching requests to:
 *   1. Refresh the Supabase session cookie (so Server Components see a valid session).
 *   2. Send signed-out visitors away from protected pages (an optimistic check;
 *      every protected page ALSO verifies the user on the server).
 *   3. Send signed-in users away from the sign-in/sign-up pages.
 */
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  // A fresh script nonce per request. Next.js reads the policy from the request
  // headers and stamps the nonce on its own scripts; the browser gets the same
  // policy on the response.
  const csp = buildCsp(createNonce(), {
    isDev: process.env.NODE_ENV !== "production",
    supabaseUrl: url,
  });
  const next = () => {
    const headers = new Headers(request.headers);
    headers.set("content-security-policy", csp);
    const res = NextResponse.next({ request: { headers } });
    res.headers.set("Content-Security-Policy", csp);
    return res;
  };
  let response = next();
  if (!url || !key) {
    // Misconfigured deployment: fail closed for protected pages.
    if (isProtectedPath(request.nextUrl.pathname)) {
      return NextResponse.redirect(new URL("/sign-in?error=config", request.url));
    }
    return response;
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = next();
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        for (const [header, value] of Object.entries(headers ?? {})) {
          response.headers.set(header, value);
        }
      },
    },
  });

  // Do not run code between createServerClient and getClaims (Supabase guidance).
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);
  const { pathname, search } = request.nextUrl;

  if (!signedIn && isProtectedPath(pathname)) {
    const target = new URL("/sign-in", request.url);
    target.searchParams.set("next", `${pathname}${search}`);
    return withCookies(NextResponse.redirect(target), response);
  }

  if (signedIn && isAuthPage(pathname)) {
    return withCookies(
      NextResponse.redirect(new URL(DEFAULT_AFTER_SIGN_IN, request.url)),
      response,
    );
  }

  // Authenticated pages must never be cached by shared caches.
  if (isProtectedPath(pathname)) {
    response.headers.set("Cache-Control", "private, no-store");
  }
  return response;
}

/** Carry refreshed auth cookies over to a redirect response. */
function withCookies(target: NextResponse, source: NextResponse): NextResponse {
  for (const cookie of source.cookies.getAll()) target.cookies.set(cookie);
  const csp = source.headers.get("Content-Security-Policy");
  if (csp) target.headers.set("Content-Security-Policy", csp);
  return target;
}

export const config = {
  matcher: [
    // Everything except static files, images, the service worker and metadata files.
    "/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|manifest.webmanifest|sw.js|icons/|robots.txt).*)",
  ],
};
