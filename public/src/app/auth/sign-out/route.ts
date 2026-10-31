import { NextResponse, type NextRequest } from "next/server";
import { logSecurityEvent } from "@/lib/audit/log";
import { publicEnv } from "@/lib/env";
import { originCheckFromRequest } from "@/lib/security/origin";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { createClient } from "@/lib/supabase/server";

/**
 * Sign out (POST only).
 *   scope=local  → this browser only
 *   scope=global → every device (revokes all refresh tokens for the account)
 * The Origin check FAILS CLOSED, so another site cannot sign users out.
 */
export async function POST(request: NextRequest) {
  if (!originCheckFromRequest(request, [publicEnv().NEXT_PUBLIC_SITE_URL])) {
    return new NextResponse("Cross-site request refused.", { status: 403 });
  }

  const form = await request.formData().catch(() => null);
  const scope = form?.get("scope") === "global" ? "global" : "local";
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();

  if (data.user) {
    if (scope === "global" && !(await consumeRateLimit(supabase, "sign_out_everywhere"))) {
      return NextResponse.redirect(new URL("/settings/security?error=rate_limited", request.url), {
        status: 303,
      });
    }
    await logSecurityEvent(
      supabase,
      scope === "global" ? "auth.signed_out_everywhere" : "auth.signed_out",
    );
    const { error } = await supabase.auth.signOut({ scope });
    if (error && scope === "global") {
      // Do not pretend every device was signed out if Supabase did not confirm it.
      return NextResponse.redirect(
        new URL("/settings/security?error=sign_out_failed", request.url),
        {
          status: 303,
        },
      );
    }
  }

  const response = NextResponse.redirect(
    new URL(`/sign-in?signed_out=${scope === "global" ? "everywhere" : "1"}`, request.url),
    { status: 303 },
  );
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Clear-Site-Data", '"cache", "storage"');
  return response;
}

export function GET() {
  return new NextResponse("Method not allowed", { status: 405, headers: { Allow: "POST" } });
}
