import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { cronSecret } from "@/lib/integrations/config";
import { runNudgeScheduler } from "@/lib/nudges/runner";

/**
 * Background scheduler endpoint for the Nudge Center.
 *
 * Called on a schedule — never by browsers:
 *   • Vercel Cron (vercel.json) sends GET with `Authorization: Bearer <CRON_SECRET>`.
 *   • The GitHub Actions schedule (.github/workflows/nudge-scheduler.yml) sends
 *     POST with the same header.
 * Without a valid CRON_SECRET every request is refused. The work is
 * idempotent, so overlapping or repeated calls are harmless.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorised(request: NextRequest): "ok" | "not_configured" | "denied" {
  const secret = cronSecret();
  if (!secret) return "not_configured";
  const header = request.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected) ? "ok" : "denied";
}

async function handle(request: NextRequest, defaultSource: "vercel_cron" | "github_actions") {
  const auth = authorised(request);
  if (auth === "not_configured") {
    return NextResponse.json({ error: "scheduler_not_configured" }, { status: 503 });
  }
  if (auth === "denied") return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const trigger = request.headers.get("x-aven-trigger");
  const source = trigger === "github_actions" || trigger === "manual" ? trigger : defaultSource;
  const result = await runNudgeScheduler({ source, deadlineMs: 50_000 });
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}

export function GET(request: NextRequest) {
  return handle(request, "vercel_cron");
}

export function POST(request: NextRequest) {
  return handle(request, "github_actions");
}
