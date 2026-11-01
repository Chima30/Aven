import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://127.0.0.1:${PORT}`;

const FAKE_SUPABASE_PORT = 54400;

/**
 * End-to-end tests run against a production build (`npm run build` first) that
 * was built with NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54400.
 *
 * Signed-in tests use tests/e2e/support/fake-supabase.mjs: a small HTTP stand-in
 * for Supabase whose queries run against a REAL PostgreSQL database with AVEN's
 * real migrations and RLS. It needs TEST_DATABASE_URL (see docs/TESTING.md).
 */
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    // Optional: point at an already-installed Chromium instead of `npx playwright install`.
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : {},
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: [
    {
      command: "node tests/e2e/support/fake-supabase.mjs",
      url: `http://127.0.0.1:${FAKE_SUPABASE_PORT}/auth/v1/.well-known/jwks.json`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { FAKE_SUPABASE_PORT: String(FAKE_SUPABASE_PORT) },
    },
    {
      command: `npx next start -p ${PORT} -H 127.0.0.1`,
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${FAKE_SUPABASE_PORT}`,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_e2e_placeholder_key",
        NEXT_PUBLIC_SITE_URL: baseURL,
        // Test-only value so server code that needs a secret can run. Not a real key.
        SUPABASE_SECRET_KEY: "e2e-test-only-not-a-real-secret-key",
      },
    },
  ],
});
