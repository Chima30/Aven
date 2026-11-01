#!/usr/bin/env node
/**
 * Fails if anything that looks like a real secret is committed.
 * Run: npm run check:secrets  (also runs in CI)
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  "coverage",
  "playwright-report",
  "test-results",
]);
const SKIP_FILES = new Set(["package-lock.json", "scripts/check-secrets.mjs"]);
const PATTERNS = [
  { name: "Supabase secret key", re: /sb_secret_[A-Za-z0-9_-]{20,}/ },
  { name: "Anthropic API key", re: /sk-ant-[A-Za-z0-9_-]{20,}/ },
  {
    name: "JWT (possible service_role key)",
    re: /eyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/,
  },
  { name: "Private key block", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: "Sui private key (suiprivkey)", re: /suiprivkey1[0-9a-z]{50,}/ },
  {
    name: "MemWal delegate key assignment",
    re: /MEMWAL_PRIVATE_KEY\s*[=:]\s*["']?(0x)?[0-9a-fA-F]{64}/,
  },
  { name: "Tatum API key assignment", re: /TATUM_API_KEY\s*[=:]\s*["']?t-[A-Za-z0-9-]{20,}/ },
  {
    name: "Namespace secret assignment",
    re: /MEMWAL_NAMESPACE_SECRET\s*[=:]\s*["']?[A-Za-z0-9+/_-]{32,}/,
  },
  {
    name: "SMTP password assignment",
    // Env-file style only (KEY=value on one line).
    re: /SMTP_PASSWORD[ \t]*=[ \t]*["']?[^\s"'<]{8,}/,
  },
  {
    name: "Cron secret assignment",
    re: /CRON_SECRET\s*[=:]\s*["']?[A-Za-z0-9+/_-]{32,}/,
  },
];

/** Non-secret variables that .env.example may give a default value for. */
const EXAMPLE_DEFAULTS_ALLOWED = new Set([
  "TATUM_SUI_RPC_URL",
  "TATUM_SUI_GRPC_HOST",
  "TATUM_SUI_GRPC_WEB_URL",
  "TATUM_SUI_TRANSPORT",
  "MEMWAL_SERVER_URL",
  "MEMWAL_NAMESPACE",
  "SMTP_PORT",
]);

const problems = [];
function walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const rel = relative(ROOT, full);
    if (statSync(full).isDirectory()) {
      walk(full);
      continue;
    }
    if (SKIP_FILES.has(rel) || /\.(png|ico|jpg|woff2?)$/.test(entry)) continue;
    if (/^\.env(\..+)?$/.test(entry) && entry !== ".env.example") {
      problems.push(`${rel}: environment file must not be committed`);
      continue;
    }
    const text = readFileSync(full, "utf8");
    for (const { name, re } of PATTERNS) if (re.test(text)) problems.push(`${rel}: ${name}`);
  }
}
walk(ROOT);

const example = readFileSync(join(ROOT, ".env.example"), "utf8");
for (const line of example.split("\n")) {
  const name = line.split("=")[0]?.trim() ?? "";
  if (/^[A-Z_]+=.+/.test(line.trim()) && !EXAMPLE_DEFAULTS_ALLOWED.has(name)) {
    problems.push(`.env.example must contain names only: ${name}`);
  }
}

if (problems.length) {
  console.error("Possible secrets found:\n" + problems.map((p) => `  • ${p}`).join("\n"));
  process.exit(1);
}
console.log("No secrets found.");
