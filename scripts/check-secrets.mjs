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
];

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
  if (/^[A-Z_]+=.+/.test(line.trim())) {
    problems.push(`.env.example must contain names only: ${line.split("=")[0]}`);
  }
}

if (problems.length) {
  console.error("Possible secrets found:\n" + problems.map((p) => `  • ${p}`).join("\n"));
  process.exit(1);
}
console.log("No secrets found.");
