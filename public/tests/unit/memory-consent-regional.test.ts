import { describe, expect, it } from "vitest";
import { CONSENT_COPY, CONSENT_ORDER } from "@/lib/consent/catalog";
import { evaluateMemoryCandidate } from "@/lib/memory/policy";
import {
  MEMORY_BACKEND_STATUS,
  MemoryUnavailableError,
  disabledMemoryStore,
} from "@/lib/memory/store";
import type { MemoryCandidate } from "@/lib/memory/types";
import { applyNumberFormat, formatDate, formatNumber } from "@/lib/regional/format";
import {
  countryOptions,
  isValidLocale,
  isValidTimeZone,
  timeZoneOptions,
} from "@/lib/regional/options";

const candidate: MemoryCandidate = {
  category: "memory_financial",
  kind: "pattern",
  summary: "Usually pays rent on the 1st of the month.",
  sourceRefs: [{ table: "transactions", id: "t1" }],
  durability: "long_term",
};
const ready = {
  grantedCategories: new Set(["memory_financial"]),
  memoryPaused: false,
  backendAvailable: true,
};

describe("memory policy", () => {
  it("allows a long-term memory with consent and an available backend", () => {
    expect(evaluateMemoryCandidate(candidate, ready)).toEqual({ allowed: true });
  });

  it.each([
    [{ ...ready, backendAvailable: false }, candidate, "backend_unavailable"],
    [{ ...ready, memoryPaused: true }, candidate, "memory_paused"],
    [{ ...ready, grantedCategories: new Set<string>() }, candidate, "no_consent"],
    [ready, { ...candidate, category: "memory_wellbeing" as const }, "no_consent"],
    [ready, { ...candidate, durability: "temporary" as const }, "temporary"],
    [ready, { ...candidate, summary: "   " }, "invalid_summary"],
    [ready, { ...candidate, summary: "x".repeat(501) }, "invalid_summary"],
    [ready, { ...candidate, sourceRefs: [] }, "no_source"],
  ])("rejects (%#)", (ctx, cand, reason) => {
    expect(evaluateMemoryCandidate(cand, ctx)).toEqual({ allowed: false, reason });
  });

  it("has no working backend in Stage 1", async () => {
    expect(MEMORY_BACKEND_STATUS.writesEnabled).toBe(false);
    await expect(disabledMemoryStore.write("u", candidate)).rejects.toBeInstanceOf(
      MemoryUnavailableError,
    );
    await expect(disabledMemoryStore.delete("u", "m")).rejects.toBeInstanceOf(
      MemoryUnavailableError,
    );
  });
});

describe("consent catalogue", () => {
  it("describes every category exactly once", () => {
    expect(new Set(CONSENT_ORDER).size).toBe(CONSENT_ORDER.length);
    expect(Object.keys(CONSENT_COPY).sort()).toEqual([...CONSENT_ORDER].sort());
  });
});

describe("regional helpers", () => {
  const base = { locale: "en-GB", timeZone: "Africa/Lagos", numberFormat: "locale" as const };
  const date = new Date("2026-03-04T23:30:00Z"); // 5 March 00:30 in Lagos

  it("formats dates in the user's time zone and chosen order", () => {
    expect(formatDate(date, { ...base, dateFormat: "dmy" })).toBe("05/03/2026");
    expect(formatDate(date, { ...base, dateFormat: "mdy" })).toBe("03/05/2026");
    expect(formatDate(date, { ...base, dateFormat: "ymd" })).toBe("2026-03-05");
    expect(formatDate(date, { ...base, dateFormat: "locale" })).toBe("5 Mar 2026");
  });

  it("applies number separator overrides without rounding", () => {
    expect(applyNumberFormat("1,234,567.891", "dot_comma")).toBe("1.234.567,891");
    expect(applyNumberFormat("1,234.5", "space_comma")).toBe("1 234,5");
    expect(formatNumber(1234.5, { locale: "en-US", numberFormat: "comma_dot" })).toBe("1,234.5");
    expect(formatNumber(1234.5, { locale: "de-DE", numberFormat: "locale" })).toBe("1.234,5");
  });

  it("validates locales and time zones", () => {
    expect(isValidLocale("en-NG")).toBe(true);
    expect(isValidLocale("not a locale")).toBe(false);
    expect(isValidTimeZone("Africa/Lagos")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
    expect(timeZoneOptions()).toContain("UTC");
  });

  it("lists countries with readable names", () => {
    const list = countryOptions();
    expect(list.find((c) => c.code === "NG")?.name).toBe("Nigeria");
    expect(list.find((c) => c.code === "KW")?.name).toBe("Kuwait");
    expect(list.length).toBeGreaterThan(240);
  });
});
