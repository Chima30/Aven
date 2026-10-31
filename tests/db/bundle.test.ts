import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import pg from "pg";
// @ts-expect-error — plain JS build script without type declarations
import { buildBundle } from "../../scripts/build-all-in-one-sql.mjs";

const ROOT = join(__dirname, "..", "..");
const ADMIN_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:54329/postgres";

describe("all-in-one SQL bundle", () => {
  const created: string[] = [];
  afterAll(async () => {
    const admin = new pg.Client({ connectionString: ADMIN_URL });
    await admin.connect();
    for (const db of created) await admin.query(`drop database if exists ${db} with (force)`);
    await admin.end();
  });

  it("is up to date with supabase/migrations (run `npm run db:bundle` if this fails)", () => {
    const onDisk = readFileSync(join(ROOT, "supabase", "stage1_all_in_one.sql"), "utf8");
    expect(onDisk).toBe(buildBundle(ROOT));
  });

  it("applies cleanly to an empty Supabase-like database", async () => {
    const name = `aven_bundle_${Date.now()}`;
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
    await client.query(readFileSync(join(ROOT, "supabase", "stage1_all_in_one.sql"), "utf8"));
    const { rows } = await client.query(
      "select count(*)::int as n from information_schema.tables where table_schema = 'public'",
    );
    expect(rows[0].n).toBe(16);
    await client.end();
  });
});
