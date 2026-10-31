#!/usr/bin/env node
/**
 * TEST-ONLY stand-in for Supabase, used by the signed-in end-to-end tests.
 *
 * It is NOT a mock of AVEN's logic: every query runs against a real
 * PostgreSQL database that has AVEN's real migrations applied, as the real
 * `authenticated` role with the user's JWT claims — so RLS and every database
 * function behave exactly as in production. Only the HTTP layer (a small
 * subset of PostgREST + GoTrue) is imitated.
 *
 * Env: TEST_DATABASE_URL (admin connection), FAKE_SUPABASE_PORT (default 54400).
 * Test helpers: POST /__test/users { email } → { id, cookieName, cookieValue }
 */
import http from "node:http";
import crypto from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

// Match PostgREST's JSON output: dates as "YYYY-MM-DD", bigint as JSON numbers.
pg.types.setTypeParser(1082, (v) => v);
pg.types.setTypeParser(20, (v) => Number(v));

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const ADMIN_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:54329/postgres";
const PORT = Number(process.env.FAKE_SUPABASE_PORT ?? 54400);
const DB_NAME = `aven_e2e_${process.pid}`;

async function setupDatabase() {
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`drop database if exists ${DB_NAME} with (force)`);
  await admin.query(`create database ${DB_NAME}`);
  await admin.end();
  const url = new URL(ADMIN_URL);
  url.pathname = `/${DB_NAME}`;
  const pool = new pg.Pool({ connectionString: url.toString(), max: 8 });
  pool.on("error", () => undefined);
  const c = await pool.connect();
  await c.query(readFileSync(join(ROOT, "tests/db/supabase-shim.sql"), "utf8"));
  const dir = join(ROOT, "supabase/migrations");
  for (const f of readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    await c.query(readFileSync(join(dir, f), "utf8"));
  }
  c.release();
  return pool;
}

const pool = await setupDatabase();
const users = new Map(); // token → user

const b64u = (s) => Buffer.from(s).toString("base64url");
function makeToken(sub, email) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const header = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64u(
    JSON.stringify({
      sub,
      email,
      role: "authenticated",
      aud: "authenticated",
      exp,
      iat: exp - 3600,
      session_id: crypto.randomUUID(),
    }),
  );
  const sig = crypto.createHmac("sha256", "e2e").update(`${header}.${body}`).digest("base64url");
  return { token: `${header}.${body}.${sig}`, exp };
}

async function asUser(userId, fn) {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: userId, role: "authenticated" }),
    ]);
    await c.query("set local role authenticated");
    const out = await fn(c);
    await c.query("commit");
    return out;
  } catch (error) {
    await c.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    c.release();
  }
}

const ident = (s) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw new Error(`bad identifier ${s}`);
  return `"${s}"`;
};

function parseFilters(params) {
  const where = [];
  const values = [];
  for (const [key, raw] of params) {
    if (["select", "order", "limit", "offset"].includes(key)) continue;
    const m = /^(eq|neq|in|is|gte|lte|gt|lt)\.(.*)$/s.exec(raw);
    if (!m) continue;
    const [, op, val] = m;
    if (op === "in") {
      const list = val
        .replace(/^\(|\)$/g, "")
        .split(",")
        .map((v) => v.replace(/^"|"$/g, ""));
      values.push(list);
      where.push(`${ident(key)}::text = any($${values.length}::text[])`);
    } else if (op === "is") {
      where.push(`${ident(key)} is ${val === "null" ? "null" : "not null"}`);
    } else {
      const sqlOp = { eq: "=", neq: "<>", gte: ">=", lte: "<=", gt: ">", lt: "<" }[op];
      values.push(val);
      where.push(`${ident(key)}::text ${sqlOp} $${values.length}`);
    }
  }
  return { where, values };
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(body === undefined ? "" : JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
    const token = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
    const user = users.get(token);

    if (url.pathname === "/__test/users" && req.method === "POST") {
      const { email } = await readBody(req);
      const { rows } = await pool.query(
        "insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id",
        [email, JSON.stringify({ display_name: email.split("@")[0] })],
      );
      const id = rows[0].id;
      const { token: access, exp } = makeToken(id, email);
      const u = {
        id,
        email,
        aud: "authenticated",
        role: "authenticated",
        email_confirmed_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        last_sign_in_at: new Date().toISOString(),
        app_metadata: {},
        user_metadata: {},
      };
      users.set(access, u);
      const session = {
        access_token: access,
        refresh_token: crypto.randomUUID(),
        expires_at: exp,
        expires_in: 3600,
        token_type: "bearer",
        user: u,
      };
      return send(res, 200, {
        id,
        cookieName: "sb-127-auth-token",
        cookieValue: `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`,
      });
    }
    if (url.pathname === "/__test/sql" && req.method === "POST") {
      const { userId, sql, params } = await readBody(req);
      const result = await asUser(userId, (c) => c.query(sql, params ?? []));
      return send(res, 200, result.rows);
    }

    if (url.pathname === "/auth/v1/user")
      return user ? send(res, 200, user) : send(res, 401, { code: 401, msg: "invalid JWT" });
    if (url.pathname.startsWith("/auth/v1/.well-known")) return send(res, 200, { keys: [] });
    if (url.pathname === "/auth/v1/logout") return send(res, 204);

    if (!user) return send(res, 401, { code: "PGRST301", message: "JWT required" });

    const rpc = /^\/rest\/v1\/rpc\/([a-z_]+)$/.exec(url.pathname);
    if (rpc) {
      const fn = rpc[1];
      const args =
        req.method === "POST" ? await readBody(req) : Object.fromEntries(url.searchParams);
      const names = Object.keys(args);
      const call = `public.${ident(fn)}(${names.map((n, i) => `${ident(n)} => $${i + 1}`).join(", ")})`;
      const values = names.map((n) =>
        args[n] !== null && typeof args[n] === "object" ? JSON.stringify(args[n]) : args[n],
      );
      const meta = await pool.query(
        "select p.proretset, t.typtype from pg_proc p join pg_type t on t.oid = p.prorettype join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = $1 limit 1",
        [fn],
      );
      const setReturning = meta.rows[0]?.proretset || meta.rows[0]?.typtype === "c";
      try {
        const result = await asUser(user.id, (c) =>
          setReturning
            ? c.query(`select * from ${call}`, values)
            : c.query(`select ${call} as v`, values),
        );
        return send(res, 200, setReturning ? result.rows : (result.rows[0]?.v ?? null));
      } catch (error) {
        return send(res, 400, { code: error.code, message: error.message });
      }
    }

    const table = /^\/rest\/v1\/([a-z_]+)$/.exec(url.pathname);
    if (table) {
      const select = (url.searchParams.get("select") ?? "*")
        .split(",")
        .map((s) => s.trim().split(":")[0].split("::")[0]);
      const cols = select.includes("*") ? "*" : select.map(ident).join(", ");
      const { where, values } = parseFilters(url.searchParams);
      const order = url.searchParams.get("order");
      const orderSql = order
        ? ` order by ${order
            .split(",")
            .map((o) => {
              const [col, dir, nulls] = o.split(".");
              return `${ident(col)} ${dir === "desc" ? "desc" : "asc"}${nulls === "nullsfirst" ? " nulls first" : nulls === "nullslast" ? " nulls last" : ""}`;
            })
            .join(", ")}`
        : "";
      const limit = url.searchParams.get("limit")
        ? ` limit ${Number(url.searchParams.get("limit"))}`
        : "";
      const sql = `select ${cols} from public.${ident(table[1])}${where.length ? ` where ${where.join(" and ")}` : ""}${orderSql}${limit}`;
      try {
        const result = await asUser(user.id, (c) => c.query(sql, values));
        const rows = result.rows;
        if (req.method === "HEAD") {
          res.writeHead(200, {
            "content-range": `0-${Math.max(0, rows.length - 1)}/${rows.length}`,
          });
          return res.end();
        }
        if ((req.headers.accept ?? "").includes("vnd.pgrst.object")) {
          if (rows.length !== 1) {
            return send(res, 406, {
              code: "PGRST116",
              details: `The result contains ${rows.length} rows`,
              message: "JSON object requested, multiple (or no) rows returned",
            });
          }
          return send(res, 200, rows[0]);
        }
        return send(res, 200, rows, {
          "content-range": `0-${Math.max(0, rows.length - 1)}/${rows.length}`,
        });
      } catch (error) {
        return send(res, 400, { code: error.code, message: error.message });
      }
    }
    send(res, 404, { message: "not found" });
  } catch (error) {
    send(res, 500, { message: String(error?.message ?? error) });
  }
});

server.listen(PORT, "127.0.0.1", () =>
  console.log(`fake-supabase listening on ${PORT} (db ${DB_NAME})`),
);

const shutdown = async () => {
  server.close();
  await pool.end().catch(() => undefined);
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect().catch(() => undefined);
  await admin.query(`drop database if exists ${DB_NAME} with (force)`).catch(() => undefined);
  await admin.end().catch(() => undefined);
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
