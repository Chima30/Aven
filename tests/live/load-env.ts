import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Loads YOUR local credentials for the optional live checks from .env.local
 * (git-ignored). Values already set in the shell win. Nothing is printed.
 */
for (const name of [".env.local", ".env"]) {
  const file = join(process.cwd(), name);
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m || line.trim().startsWith("#")) continue;
    const key = m[1]!;
    let value = m[2]!;
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
    if (process.env[key] === undefined || process.env[key] === "") process.env[key] = value;
  }
}
