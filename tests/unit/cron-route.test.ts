import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const run = vi.fn(async () => ({ users: 0, notifications: 0 }));
vi.mock("@/lib/nudges/runner", () => ({ runNudgeScheduler: run }));

const SECRET = "s".repeat(40);
const req = (method: "GET" | "POST", auth?: string, trigger?: string) =>
  new NextRequest("https://aven.example/api/cron/nudges", {
    method,
    headers: {
      ...(auth ? { authorization: auth } : {}),
      ...(trigger ? { "x-aven-trigger": trigger } : {}),
    },
  });

describe("/api/cron/nudges", () => {
  beforeEach(() => run.mockClear());
  afterEach(() => vi.unstubAllEnvs());

  it("refuses everything when CRON_SECRET isn't configured (or is too short)", async () => {
    const { GET } = await import("@/app/api/cron/nudges/route");
    vi.stubEnv("CRON_SECRET", "");
    expect((await GET(req("GET", `Bearer ${SECRET}`))).status).toBe(503);
    vi.stubEnv("CRON_SECRET", "short");
    expect((await GET(req("GET", "Bearer short"))).status).toBe(503);
    expect(run).not.toHaveBeenCalled();
  });

  it("rejects a missing or wrong bearer token", async () => {
    const { GET, POST } = await import("@/app/api/cron/nudges/route");
    vi.stubEnv("CRON_SECRET", SECRET);
    expect((await GET(req("GET"))).status).toBe(401);
    expect((await POST(req("POST", `Bearer ${"x".repeat(40)}`))).status).toBe(401);
    expect((await POST(req("POST", SECRET))).status).toBe(401);
    expect(run).not.toHaveBeenCalled();
  });

  it("runs the scheduler for Vercel Cron (GET) and GitHub Actions (POST)", async () => {
    const { GET, POST } = await import("@/app/api/cron/nudges/route");
    vi.stubEnv("CRON_SECRET", SECRET);
    expect((await GET(req("GET", `Bearer ${SECRET}`))).status).toBe(200);
    expect(run).toHaveBeenLastCalledWith(expect.objectContaining({ source: "vercel_cron" }));
    expect((await POST(req("POST", `Bearer ${SECRET}`, "github_actions"))).status).toBe(200);
    expect(run).toHaveBeenLastCalledWith(expect.objectContaining({ source: "github_actions" }));
  });
});
