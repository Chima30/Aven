import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const alias = { "@": fileURLToPath(new URL("./src", import.meta.url)) };

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.ts"],
          environment: "node",
          setupFiles: ["tests/unit/setup.ts"],
        },
      },
      {
        resolve: { alias },
        test: {
          name: "db",
          include: ["tests/db/**/*.test.ts"],
          environment: "node",
          setupFiles: ["tests/unit/setup.ts"],
          // Database tests share one Postgres instance; run files one at a time.
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
      {
        // OPTIONAL live checks against Walrus Mainnet and Tatum, using YOUR
        // credentials from .env.local (never committed). Run with:
        //   npm run verify:tatum   /   npm run verify:walrus
        // They skip themselves when credentials are missing.
        resolve: { alias },
        test: {
          name: "live",
          include: ["tests/live/**/*.live.ts"],
          environment: "node",
          setupFiles: ["tests/unit/setup.ts", "tests/live/load-env.ts"],
          fileParallelism: false,
          testTimeout: 15 * 60_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
