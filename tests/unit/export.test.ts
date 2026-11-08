import { describe, expect, it } from "vitest";
import type { User } from "@supabase/supabase-js";
import { EXPORT_PAGE_SIZE, EXPORT_TABLES, buildUserExport } from "@/lib/data/export";
import type { ServerSupabase } from "@/lib/supabase/server";

/**
 * A stand-in for Supabase that, like the real API, returns at most
 * EXPORT_PAGE_SIZE rows per request.
 */
function fakeSupabase(rowsByTable: Record<string, unknown[]>, failOn?: string) {
  const calls: { table: string; from: number; to: number; order: string[] }[] = [];
  const client = {
    from(table: string) {
      const order: string[] = [];
      const query = {
        select: () => query,
        order(column: string) {
          order.push(column);
          return query;
        },
        async range(from: number, to: number) {
          calls.push({ table, from, to, order: [...order] });
          if (table === failOn) return { data: null, error: { message: "boom" } };
          const all = rowsByTable[table] ?? [];
          const end = Math.min(to + 1, from + EXPORT_PAGE_SIZE);
          return { data: all.slice(from, end), error: null };
        },
      };
      return query;
    },
  };
  return { client: client as unknown as ServerSupabase, calls };
}

const user = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "ada@example.com",
  created_at: "2026-10-01T00:00:00Z",
  email_confirmed_at: null,
} as unknown as User;

describe("data export", () => {
  it("includes every row, even past Supabase's 1,000-row response cap", async () => {
    const transactions = Array.from({ length: 2_345 }, (_, i) => ({ id: i }));
    const { client, calls } = fakeSupabase({ transactions, profiles: [{ id: user.id }] });

    const result = await buildUserExport(client, user);

    expect(result.data.transactions).toHaveLength(2_345);
    expect(result.data.transactions.at(-1)).toEqual({ id: 2_344 });
    expect(result.data.profiles).toHaveLength(1);
    const txCalls = calls.filter((c) => c.table === "transactions");
    expect(txCalls.map((c) => c.from)).toEqual([0, 1000, 2000]);
    expect(txCalls.every((c) => c.order.join() === "id")).toBe(true);
  });

  it("reads exactly one page for small tables, ordered by the primary key", async () => {
    const { client, calls } = fakeSupabase({});
    await buildUserExport(client, user);
    expect(calls).toHaveLength(EXPORT_TABLES.length);
    expect(calls.find((c) => c.table === "consent_state")?.order).toEqual(["user_id", "category"]);
  });

  it("fails instead of returning a partial export", async () => {
    const { client } = fakeSupabase({}, "water_logs");
    await expect(buildUserExport(client, user)).rejects.toThrow(/water_logs/);
  });
});
