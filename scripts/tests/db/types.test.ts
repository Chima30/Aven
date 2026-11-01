import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase, type TestDb } from "./harness";

/**
 * Guards against drift between the hand-written TypeScript database types
 * (src/lib/supabase/database.types.ts) and the real schema produced by the
 * migrations. If a migration adds, removes or renames a column, table, view or
 * public function, this test fails until the types are updated.
 */

const TYPES = readFileSync(
  join(__dirname, "..", "..", "src/lib/supabase/database.types.ts"),
  "utf8",
);

function tsTableTypes(): Map<string, string> {
  const map = new Map<string, string>();
  for (const m of TYPES.matchAll(/^\s+(\w+): Table<\s*(\w+)/gm)) map.set(m[1]!, m[2]!);
  for (const m of TYPES.matchAll(/^\s+(\w+): \{ Row: (\w+);/gm)) map.set(m[1]!, m[2]!);
  return map;
}

function tsFields(typeName: string): Set<string> {
  const block = new RegExp(`export type ${typeName} = \\{([\\s\\S]*?)\\n\\};`).exec(TYPES);
  if (!block) throw new Error(`Type ${typeName} not found`);
  return new Set([...block[1]!.matchAll(/^\s+(\w+)\??:/gm)].map((m) => m[1]!));
}

let db: TestDb;
beforeAll(async () => {
  db = await createTestDatabase();
});
afterAll(async () => {
  await db?.close();
});

describe("TypeScript database types match the migrated schema", () => {
  it("has a type for every public table and view, with exactly the same columns", async () => {
    const { rows } = await db.pool.query<{ table_name: string; columns: string[] }>(`
      select table_name, array_agg(column_name::text order by column_name) as columns
      from information_schema.columns where table_schema = 'public'
      group by table_name order by table_name`);
    const types = tsTableTypes();
    const problems: string[] = [];
    for (const { table_name, columns } of rows) {
      const typeName = types.get(table_name);
      if (!typeName) {
        problems.push(`${table_name}: no TypeScript type`);
        continue;
      }
      const ts = tsFields(typeName);
      const missing = columns.filter((c) => !ts.has(c));
      const extra = [...ts].filter((c) => !columns.includes(c));
      if (missing.length || extra.length) {
        problems.push(`${table_name}: missing in TS [${missing}] / not in DB [${extra}]`);
      }
    }
    expect(problems).toEqual([]);
  });

  it("types every public database function", async () => {
    const { rows } = await db.pool.query<{ proname: string }>(`
      select distinct p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' order by 1`);
    const missing = rows
      .map((r) => r.proname)
      .filter((name) => !new RegExp(`^\\s+${name}: \\{`, "m").test(TYPES));
    expect(missing).toEqual([]);
  });
});
