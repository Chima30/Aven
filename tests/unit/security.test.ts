import { describe, expect, it } from "vitest";
import { isSameOriginRequest } from "@/lib/security/origin";
import { DEFAULT_AFTER_SIGN_IN, safeRedirectPath } from "@/lib/security/redirects";
import { isAuthPage, isProtectedPath } from "@/lib/auth/routes";

describe("safeRedirectPath (open-redirect protection)", () => {
  it("allows same-site relative paths", () => {
    expect(safeRedirectPath("/settings/security")).toBe("/settings/security");
    expect(safeRedirectPath("/overview?tab=1#x")).toBe("/overview?tab=1#x");
  });

  it.each([
    null,
    undefined,
    "",
    "https://evil.com",
    "//evil.com",
    "//evil.com/overview",
    "/\\evil.com",
    "\\\\evil.com",
    "javascript:alert(1)",
    "overview",
    "/auth/confirm?next=//evil.com",
    "/%0d%0aSet-Cookie:x",
    "/\u0000",
    `/${"a".repeat(600)}`,
  ])("rejects %s", (value) => {
    expect(safeRedirectPath(value)).toBe(DEFAULT_AFTER_SIGN_IN);
  });

  it("rejects encoded protocol-relative and malformed encodings", () => {
    expect(safeRedirectPath("/%2F%2Fevil.com")).toBe(DEFAULT_AFTER_SIGN_IN);
    expect(safeRedirectPath("/%E0%A4%A")).toBe(DEFAULT_AFTER_SIGN_IN);
    expect(safeRedirectPath("/settings/data%3Ftab%3D1")).toBe("/settings/data%3Ftab%3D1");
  });
});

describe("isSameOriginRequest (CSRF, fails closed)", () => {
  const allowed = ["https://aven.app"];
  const base = { method: "POST", host: "aven.app", allowedOrigins: allowed };

  it("allows safe methods", () => {
    expect(isSameOriginRequest({ ...base, method: "GET", origin: null, secFetchSite: null })).toBe(
      true,
    );
  });

  it("allows matching Origin", () => {
    expect(isSameOriginRequest({ ...base, origin: "https://aven.app", secFetchSite: null })).toBe(
      true,
    );
  });

  it("allows the request's own host (preview deployments)", () => {
    expect(
      isSameOriginRequest({
        ...base,
        host: "aven-git-x.vercel.app",
        origin: "https://aven-git-x.vercel.app",
        secFetchSite: null,
      }),
    ).toBe(true);
  });

  it("rejects cross-site Origin", () => {
    expect(
      isSameOriginRequest({ ...base, origin: "https://evil.com", secFetchSite: "cross-site" }),
    ).toBe(false);
    expect(
      isSameOriginRequest({ ...base, origin: "https://aven.app.evil.com", secFetchSite: null }),
    ).toBe(false);
    expect(isSameOriginRequest({ ...base, origin: "null", secFetchSite: null })).toBe(false);
  });

  it("falls back to Sec-Fetch-Site when Origin is missing", () => {
    expect(isSameOriginRequest({ ...base, origin: null, secFetchSite: "same-origin" })).toBe(true);
    expect(isSameOriginRequest({ ...base, origin: null, secFetchSite: "same-site" })).toBe(false);
    expect(isSameOriginRequest({ ...base, origin: null, secFetchSite: "cross-site" })).toBe(false);
  });

  it("fails closed when no provenance headers are present", () => {
    expect(isSameOriginRequest({ ...base, origin: null, secFetchSite: null })).toBe(false);
  });
});

describe("route classification", () => {
  it("protects app routes", () => {
    expect(isProtectedPath("/overview")).toBe(true);
    expect(isProtectedPath("/settings/data")).toBe(true);
    expect(isProtectedPath("/intelligence")).toBe(true);
    expect(isProtectedPath("/intelligence/memory")).toBe(true);
    expect(isProtectedPath("/money/wallets")).toBe(true);
    expect(isProtectedPath("/settingsX")).toBe(false);
    expect(isProtectedPath("/")).toBe(false);
    expect(isProtectedPath("/privacy")).toBe(false);
  });
  it("knows auth pages", () => {
    expect(isAuthPage("/sign-in")).toBe(true);
    expect(isAuthPage("/sign-in/x")).toBe(false);
  });
});
