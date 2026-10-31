import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import pg from "pg";

/**
 * Database test harness.
 *
 * Creates a fresh database, applies the Supabase shim and every migration in
 * supabase/migrations (in filename order), then lets tests run queries as a
 * specific signed-in user, as an anonymous visitor, or as the service role.
 *
 * Requires a PostgreSQL 15+ server. Set TEST_DATABASE_URL to point at one
 * (default: postgres://postgres:postgres@127.0.0.1:54329/postgres).
 */

const ADMIN_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:54329/postgres";

const ROOT = join(__dirname, "..", "..");

export function migrationFiles(): string[] {
  const dir = join(ROOT, "supabase", "migrations");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => join(dir, f));
}

export interface TestDb {
  pool: pg.Pool;
  dbName: string;
  close(): Promise<void>;
}

export async function createTestDatabase(): Promise<TestDb> {
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  try {
    await admin.connect();
  } catch (error) {
    throw new Error(
      `Could not connect to PostgreSQL at ${ADMIN_URL}. Database tests need a running Postgres ` +
        `server (CI provides one). Original error: ${(error as Error).message}`,
    );
  }
  const dbName = `aven_test_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  await admin.query(`create database ${dbName}`);
  await admin.end();

  const url = new URL(ADMIN_URL);
  url.pathname = `/${dbName}`;
  const pool = new pg.Pool({ connectionString: url.toString(), max: 4 });

  const setup = await pool.connect();
  try {
    await setup.query(readFileSync(join(__dirname, "supabase-shim.sql"), "utf8"));
    for (const file of migrationFiles()) {
      try {
        await setup.query(readFileSync(file, "utf8"));
      } catch (error) {
        throw new Error(`Migration failed: ${file}\n${(error as Error).message}`);
      }
    }
  } finally {
    setup.release();
  }

  return {
    pool,
    dbName,
    async close() {
      await pool.end();
      const cleanup = new pg.Client({ connectionString: ADMIN_URL });
      await cleanup.connect();
      await cleanup.query(`drop database if exists ${dbName} with (force)`);
      await cleanup.end();
    },
  };
}

/** Create an auth user (as Supabase Auth would) and return its id. */
export async function createUser(
  db: TestDb,
  email: string,
  meta: Record<string, unknown> = {},
): Promise<string> {
  const result = await db.pool.query<{ id: string }>(
    "insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id",
    [email, JSON.stringify(meta)],
  );
  const row = result.rows[0];
  if (!row) throw new Error("User was not created");
  return row.id;
}

type Role = "authenticated" | "anon" | "service_role";

/**
 * Run `fn` inside a transaction with the given Postgres role and JWT subject,
 * exactly like PostgREST does for each Supabase API request.
 * The transaction commits unless `fn` throws.
 */
export async function runAs<T>(
  db: TestDb,
  role: Role,
  userId: string | null,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await db.pool.connect();
  try {
    await client.query("begin");
    const claims = userId ? { sub: userId, role } : { role };
    await client.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify(claims),
    ]);
    await client.query(`set local role ${role}`);
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export const asUser = <T>(db: TestDb, userId: string, fn: (c: pg.PoolClient) => Promise<T>) =>
  runAs(db, "authenticated", userId, fn);

export const asAnon = <T>(db: TestDb, fn: (c: pg.PoolClient) => Promise<T>) =>
  runAs(db, "anon", null, fn);

export const asService = <T>(db: TestDb, fn: (c: pg.PoolClient) => Promise<T>) =>
  runAs(db, "service_role", null, fn);

/** Expect a promise to reject with a Postgres error; returns the SQLSTATE code. */
export async function pgErrorCode(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return (error as { code?: string }).code ?? "unknown";
  }
  throw new Error("Expected the database to reject this query, but it succeeded");
}
