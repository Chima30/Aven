import { describe, expect, it } from "vitest";
import { SUPABASE_PAGE_SIZE, fetchAllPages } from "@/lib/supabase/paging";
import { completeMonthsOnly } from "@/lib/intelligence/server";

/** Behaves like Supabase: never more than 1,000 rows per request. */
function table(n: number) {
  const rows = Array.from({ length: n }, (_, i) => i);
  const calls: [number, number][] = [];
  const page = async (from: number, to: number) => {
    calls.push([from, to]);
    return { data: rows.slice(from, Math.min(to + 1, from + SUPABASE_PAGE_SIZE)), error: null };
  };
  return { page, calls };
}

describe("fetchAllPages", () => {
  it("reads past Supabase's 1,000-row cap", async () => {
    const { page, calls } = table(2_500);
    const res = await fetchAllPages(page);
    expect(res.data).toHaveLength(2_500);
    expect(res.data.at(-1)).toBe(2_499);
    expect(res.truncated).toBe(false);
    expect(calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it("asks once more when the last page is exactly full", async () => {
    const { page, calls } = table(1_000);
    const res = await fetchAllPages(page);
    expect(res.data).toHaveLength(1_000);
    expect(calls).toHaveLength(2);
  });

  it("stops at the maximum and says so", async () => {
    const { page } = table(5_000);
    const res = await fetchAllPages(page, { max: 1_500 });
    expect(res.data).toHaveLength(1_500);
    expect(res.truncated).toBe(true);
  });

  it("returns the error instead of a silent partial list", async () => {
    let n = 0;
    const res = await fetchAllPages(async () =>
      n++ === 0
        ? { data: Array.from({ length: 1000 }, () => 0), error: null }
        : { data: null, error: { message: "boom" } },
    );
    expect(res.error).toEqual({ message: "boom" });
  });
});

describe("transactions for analysis", () => {
  it("keep everything when the list wasn't cut short", () => {
    const rows = [{ occurred_on: "2026-11-02" }, { occurred_on: "2026-06-01" }];
    expect(completeMonthsOnly(rows, false)).toEqual(rows);
  });

  it("drop the partly-loaded oldest month, never the newest", () => {
    const rows = [
      { occurred_on: "2026-11-03" },
      { occurred_on: "2026-10-15" },
      { occurred_on: "2026-07-20" },
      { occurred_on: "2026-07-02" },
    ];
    expect(completeMonthsOnly(rows, true).map((r) => r.occurred_on)).toEqual([
      "2026-11-03",
      "2026-10-15",
    ]);
  });
});
