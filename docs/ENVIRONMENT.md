# Environment variables

Validated at runtime with Zod (`src/lib/env.ts`, `src/lib/env.server.ts`). A missing or
invalid value produces a clear error that names the variable.

| Variable                               | Exposed to browser?           | Required               | Where to find it                                                            |
| -------------------------------------- | ----------------------------- | ---------------------- | --------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | Yes                           | Yes                    | Supabase → Project Settings → Data API → Project URL                        |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Yes (safe: RLS protects data) | Yes                    | Supabase → Project Settings → API Keys → Publishable key (or legacy `anon`) |
| `NEXT_PUBLIC_SITE_URL`                 | Yes                           | Yes                    | Your site address, e.g. `https://aven.vercel.app` (no trailing slash)       |
| `SUPABASE_SECRET_KEY`                  | **No, never**                 | Yes (account deletion) | Supabase → API Keys → Secret key (or legacy `service_role`)                 |

The validation refuses a secret key placed in the publishable slot, and vice versa.

## Future stages (not used yet; do not add)

| Variable                                                      | Stage                     |
| ------------------------------------------------------------- | ------------------------- |
| `ANTHROPIC_API_KEY`                                           | 6 (server only)           |
| Walrus credentials (names to be confirmed from official docs) | 6 (server only)           |
| `TATUM_API_KEY`                                               | 7, optional (server only) |

## Rules

- Anything starting with `NEXT_PUBLIC_` is public. Never give a secret that prefix.
- `NEXT_PUBLIC_` values are built into the app, so after changing one in Vercel you must
  **Redeploy**.
- Local development: copy `.env.example` to `.env.local` (git-ignored) and fill it in.
- Tests only: `TEST_DATABASE_URL` (Postgres for RLS tests) and `PLAYWRIGHT_CHROMIUM_EXECUTABLE`
  (optional path to an existing Chromium).
