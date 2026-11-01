import { NextResponse, type NextRequest } from "next/server";
import { buildUserExport } from "@/lib/data/export";
import { publicEnv } from "@/lib/env";
import { originCheckFromRequest } from "@/lib/security/origin";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { createClient } from "@/lib/supabase/server";

/**
 * Download a JSON export of the signed-in user's data (POST only).
 * Uses the user's own session, so RLS limits the export to their rows.
 */
export async function POST(request: NextRequest) {
  if (!originCheckFromRequest(request, [publicEnv().NEXT_PUBLIC_SITE_URL])) {
    return new NextResponse("Cross-site request refused.", { status: 403 });
  }
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.redirect(new URL("/sign-in?next=/settings/data", request.url), {
      status: 303,
    });
  }
  if (!(await consumeRateLimit(supabase, "export_data"))) {
    return NextResponse.redirect(new URL("/settings/data?export=rate_limited", request.url), {
      status: 303,
    });
  }

  let body: string;
  try {
    body = JSON.stringify(await buildUserExport(supabase, auth.user), null, 2);
  } catch {
    return NextResponse.redirect(new URL("/settings/data?export=failed", request.url), {
      status: 303,
    });
  }
  const bytes = new TextEncoder().encode(body).byteLength;
  await supabase.rpc("record_data_export", { p_format: "json", p_byte_size: bytes });

  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="aven-export-${date}.json"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export function GET() {
  return new NextResponse("Method not allowed", { status: 405, headers: { Allow: "POST" } });
}
