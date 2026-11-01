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

## Optional integrations (server only — never `NEXT_PUBLIC_`)

Validated in `src/lib/integrations/config.ts`. If none of a group is set, the feature shows "not
configured"; a partial or malformed group is reported as **invalid** (by variable name, never
echoing the value) on Settings → Integrations.

| Variable                                            | Required for        | Default                                     | Details                                                              |
| --------------------------------------------------- | ------------------- | ------------------------------------------- | -------------------------------------------------------------------- |
| `MEMWAL_PRIVATE_KEY`                                | Walrus Memory       | —                                           | **Secret.** WALRUS_SETUP.md                                          |
| `MEMWAL_ACCOUNT_ID`                                 | Walrus Memory       | —                                           | `0x…` account object id                                              |
| `MEMWAL_NAMESPACE_SECRET`                           | Walrus Memory       | —                                           | **Secret.** 32+ chars, set once                                      |
| `MEMWAL_SERVER_URL`                                 | —                   | `https://relayer.memory.walrus.xyz`         | https only                                                           |
| `MEMWAL_NAMESPACE`                                  | —                   | `aven-production`                           | lowercase, digits, hyphens                                           |
| `TATUM_API_KEY`                                     | Sui wallets         | —                                           | **Secret.** TATUM_SETUP.md                                           |
| `TATUM_SUI_TRANSPORT`                               | —                   | `grpc`                                      | `grpc` · `grpc-web` · `jsonrpc`                                      |
| `TATUM_SUI_GRPC_HOST`                               | —                   | `sui-mainnet-grpc.gateway.tatum.io:443`     | host:port                                                            |
| `TATUM_SUI_GRPC_WEB_URL`                            | —                   | `https://sui-mainnet-grpc.gateway.tatum.io` |                                                                      |
| `TATUM_SUI_RPC_URL`                                 | —                   | `https://sui-mainnet.gateway.tatum.io`      | deprecated JSON-RPC fallback                                         |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `EMAIL_FROM` | Email notifications | port `465`                                  | EMAIL.md                                                             |
| `SMTP_PASSWORD`                                     | Email notifications | —                                           | **Secret.** e.g. a Gmail app password. EMAIL.md                      |
| `CRON_SECRET`                                       | Background nudges   | —                                           | **Secret.** 32+ chars; same value as the GitHub secret. SCHEDULER.md |

Live-check only (your machine, never Vercel): `AVEN_WALRUS_MAINNET_CONFIRM`,
`TATUM_VERIFY_ADDRESS`, `TATUM_VERIFY_ALL_TRANSPORTS` — see the setup guides.

## Rules

- Anything starting with `NEXT_PUBLIC_` is public. Never give a secret that prefix.
- `NEXT_PUBLIC_` values are built into the app, so after changing one in Vercel you must
  **Redeploy**.
- Local development: copy `.env.example` to `.env.local` (git-ignored) and fill it in.
- The Planning / Nudge Center / Wellbeing phase adds only `CRON_SECRET` (optional: without it,
  reminders are still produced whenever you open AVEN). GitHub Actions also needs repository
  secrets `AVEN_URL` and `CRON_SECRET` — those live in GitHub, not in Vercel.
- Stage 2 adds **no new environment variables**. `SUPABASE_SECRET_KEY` is now also used to sign
  the short-lived password-recovery cookie.
- Tests only: `TEST_DATABASE_URL` (Postgres for database and end-to-end tests) and
  `PLAYWRIGHT_CHROMIUM_EXECUTABLE` (optional path to an existing Chromium). The e2e build
  uses `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54400` (the test-only fake Supabase).
