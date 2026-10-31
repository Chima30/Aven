#!/usr/bin/env node
/**
 * Concatenates supabase/migrations/*.sql into supabase/stage1_all_in_one.sql
 * so the whole database can be set up with ONE paste into the Supabase SQL Editor.
 * Run: npm run db:bundle   (a test fails if the bundle is out of date)
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function buildBundle(root = process.cwd()) {
  const dir = join(root, "supabase", "migrations");
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const header = [
    "-- =============================================================================",
    "-- AVEN — ALL MIGRATIONS IN ONE FILE (generated; do not edit by hand)",
    "-- Paste this whole file into Supabase → SQL Editor → New query → Run, ONCE,",
    "-- on a NEW, EMPTY project. It runs inside a single transaction: if anything",
    "-- fails, nothing is applied.",
    `-- Contains: ${files.join(", ")}`,
    "-- =============================================================================",
    "",
    "begin;",
    "",
  ].join("\n");
  const body = files
    .map((f) => `-- >>> ${f}\n${readFileSync(join(dir, f), "utf8").trim()}\n`)
    .join("\n");
  return `${header}${body}\ncommit;\n`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  writeFileSync(join(process.cwd(), "supabase", "stage1_all_in_one.sql"), buildBundle());
  console.log("Wrote supabase/stage1_all_in_one.sql");
}
