import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import pg from "pg";
// @ts-expect-error — plain JS build script without type declarations
import { buildBundles } from "../../scripts/build-all-in-one-sql.mjs";

const ROOT = join(__dirname, "..", "..");
const ADMIN_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:54329/postgres";

const created: string[] = [];

async function freshDatabase(): Promise<pg.Client> {
  const name = `aven_bundle_${Date.now()}_${created.length}`;
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`create database ${name}`);
  await admin.end();
  created.push(name);
  const url = new URL(ADMIN_URL);
  url.pathname = `/${name}`;
  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  await client.query(readFileSync(join(__dirname, "supabase-shim.sql"), "utf8"));
  return client;
}

const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const tableCount = async (c: pg.Client) =>
  (
    await c.query(
      "select count(*)::int as n from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'",
    )
  ).rows[0].n;

describe("copy-paste SQL bundles", () => {
  afterAll(async () => {
    const admin = new pg.Client({ connectionString: ADMIN_URL });
    await admin.connect();
    for (const db of created) await admin.query(`drop database if exists ${db} with (force)`);
    await admin.end();
  });

  it("are up to date with supabase/migrations (run `npm run db:bundle` if this fails)", () => {
    for (const [path, content] of Object.entries(buildBundles(ROOT) as Record<string, string>)) {
      expect(read(path), path).toBe(content);
    }
  });

  it("full setup applies cleanly to an empty project", async () => {
    const c = await freshDatabase();
    await c.query(read("supabase/setup_all_in_one.sql"));
    expect(await tableCount(c)).toBe(27);
    await c.end();
  });

  it("stage 1 then the stage 2 upgrade gives the same result, keeping existing users", async () => {
    const c = await freshDatabase();
    await c.query(read("supabase/upgrades/stage1.sql"));
    await c.query("insert into auth.users (email) values ('existing@example.com')");
    await c.query(read("supabase/upgrades/stage2.sql"));
    expect(await tableCount(c)).toBe(23);
    // Existing Stage 1 users get default categories during the upgrade.
    const { rows } = await c.query("select count(*)::int as n from transaction_categories");
    expect(rows[0].n).toBe(18);
    await c.end();
  });

  it("stage 2 then the stage 3 and 4 upgrades reach the full schema", async () => {
    const c = await freshDatabase();
    await c.query(read("supabase/upgrades/stage1.sql"));
    await c.query(read("supabase/upgrades/stage2.sql"));
    await c.query("insert into auth.users (email) values ('existing@example.com')");
    await c.query(read("supabase/upgrades/stage3.sql"));
    expect(await tableCount(c)).toBe(26);
    await c.query(read("supabase/upgrades/stage4.sql"));
    expect(await tableCount(c)).toBe(27);
    const { rows } = await c.query(
      "select category, is_available, policy_version from consent_categories where category like 'memory_%' order by category",
    );
    expect(rows.find((r) => r.category === "memory_financial")).toMatchObject({
      is_available: true,
      policy_version: "2026-11-02",
    });
    expect(rows.filter((r) => r.is_available)).toHaveLength(1);
    await c.end();
  });
});
