import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isAuthPage, isProtectedPath } from "@/lib/auth/routes";
import { DEFAULT_AFTER_SIGN_IN } from "@/lib/security/redirects";

/**
 * Runs before matching requests to:
 *   1. Refresh the Supabase session cookie (so Server Components see a valid session).
 *   2. Send signed-out visitors away from protected pages (an optimistic check;
 *      every protected page ALSO verifies the user on the server).
 *   3. Send signed-in users away from the sign-in/sign-up pages.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
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
        response = NextResponse.next({ request });
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
  return target;
}

export const config = {
  matcher: [
    // Everything except static files, images, the service worker and metadata files.
    "/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|manifest.webmanifest|sw.js|icons/|robots.txt).*)",
  ],
};
