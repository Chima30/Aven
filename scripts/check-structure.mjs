#!/usr/bin/env node
/**
 * Project-structure guard (runs first in CI and in `npm run verify`).
 *
 * Why: everything inside public/ is served to the whole internet by Next.js and
 * Vercel. A mis-placed upload once put a full copy of the project (source code,
 * SQL migrations, tests, docs) into public/, which both exposed it publicly and
 * caused hundreds of TypeScript errors (Stage 2 code compiled against Stage 1).
 * This check fails fast with a clear message if that ever happens again.
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const ROOT = process.cwd();
const problems = [];

// 1. public/ may only contain static web assets.
const ALLOWED_PUBLIC_EXT = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".svg",
  ".ico",
  ".gif",
  ".avif",
  ".woff2",
  ".txt",
  ".webmanifest",
]);
const ALLOWED_PUBLIC_FILES = new Set(["sw.js"]);
function walkPublic(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const rel = relative(ROOT, full);
    if (statSync(full).isDirectory()) {
      if (
        [
          "src",
          "supabase",
          "tests",
          "docs",
          "scripts",
          ".github",
          "public",
          "node_modules",
        ].includes(entry)
      ) {
        problems.push(
          `${rel}/ — project folders must be at the repository root, not inside public/`,
        );
        continue;
      }
      walkPublic(full);
    } else if (
      !(dir === join(ROOT, "public") && ALLOWED_PUBLIC_FILES.has(entry)) &&
      !ALLOWED_PUBLIC_EXT.has(extname(entry).toLowerCase())
    ) {
      problems.push(`${rel} — only static assets belong in public/ (it is served publicly)`);
    }
  }
}
if (existsSync(join(ROOT, "public"))) walkPublic(join(ROOT, "public"));

// 2. The project must have exactly one root.
const REQUIRED = [
  "package.json",
  "tsconfig.json",
  "next.config.ts",
  "src/app/layout.tsx",
  "src/proxy.ts",
  "supabase/migrations",
];
for (const path of REQUIRED)
  if (!existsSync(join(ROOT, path))) problems.push(`missing ${path} at the repository root`);
const SKIP = new Set([
  "node_modules",
  ".git",
  ".next",
  "coverage",
  "playwright-report",
  "test-results",
]);
function findNestedRoots(dir, depth = 0) {
  if (depth > 4) return;
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (existsSync(join(full, "package.json")))
        problems.push(
          `${relative(ROOT, full)}/package.json — a second copy of the project is nested here`,
        );
      findNestedRoots(full, depth + 1);
    }
  }
}
findNestedRoots(ROOT);

if (problems.length) {
  console.error("Project structure problems:\n" + problems.map((p) => `  • ${p}`).join("\n"));
  console.error("\nSee docs/GITHUB_UPLOAD.md: the ZIP's contents go at the repository root.");
  process.exit(1);
}
console.log("Project structure OK.");
