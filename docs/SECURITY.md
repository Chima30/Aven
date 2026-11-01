# Security

## Boundaries

| Boundary          | Rule                                                                                                                                                                                                                                                                                         |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Browser ↔ server  | The browser only ever has the Supabase **publishable** key. Secrets are read in `src/lib/env.server.ts`, which imports `server-only` so the build fails if a Client Component imports it.                                                                                                    |
| Server ↔ database | Normal operations use the **user's session**, so RLS applies.                                                                                                                                                                                                                                |
| Finance writes    | Only through `apply_finance_mutation()`: user from the session, explicit ownership checks on every referenced id, optimistic versions, idempotency receipts. Users can only SELECT finance tables.                                                                                           |
| Admin access      | The Supabase **secret** key is used only in `src/lib/supabase/admin.ts`: account deletion; writing `memory_records` (relayer-sourced job ids, blob ids, statuses must not be user-forgeable); linking a recommendation's outcome memory. Every admin query filters by the session's user id. |
| Walrus Memory     | `MEMWAL_PRIVATE_KEY` and `MEMWAL_NAMESPACE_SECRET` are read only in `src/lib/integrations/config.ts` (`server-only`). Every write passes the policy gate; every read is confined to the session user's HMAC namespace.                                                                       |
| Tatum / Sui       | `TATUM_API_KEY` server-only, sent as `x-api-key` gRPC metadata from the server. Read-only calls; AVEN never signs or sends transactions and stores only public addresses.                                                                                                                    |
| AI provider       | Not used. Insights are deterministic; no data is sent to an AI provider.                                                                                                                                                                                                                     |

## Implemented controls (Stages 1–2)

| Control                                                                                          | Where                                                                       | Tested                                                     |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- | ---------------------------------------------------------- |
| RLS on every public table, owner-only policies                                                   | migrations                                                                  | `tests/db/rls.test.ts` (real Postgres, two users, anon)    |
| Column-level update grants                                                                       | migrations                                                                  | yes (`created_at`, `user_id`, AI limits can't be changed)  |
| Append-only consent history and audit log                                                        | migrations                                                                  | yes                                                        |
| Server-verified session on every protected page                                                  | `getUser()` in `(app)/layout.tsx`                                           | e2e for signed-out redirect; signed-in needs real Supabase |
| CSRF: Server Actions                                                                             | Next.js Origin/Host check                                                   | framework behaviour                                        |
| CSRF: Route Handlers (sign-out, export)                                                          | `src/lib/security/origin.ts`, **fails closed**                              | unit + e2e (403 cross-site and no-header)                  |
| Open-redirect protection                                                                         | `safeRedirectPath`                                                          | unit + e2e                                                 |
| Zod validation of all form input                                                                 | `src/lib/validation/schemas.ts`                                             | unit/e2e                                                   |
| Rate limits: delete account, change password, export, sign out everywhere                        | `consume_rate_limit()`; **fails closed**                                    | DB tests                                                   |
| Auth rate limits (sign-up/in, emails)                                                            | Supabase Auth built-in limits                                               | not testable here                                          |
| Re-authentication for delete / password change                                                   | `verifyPasswordForUser`                                                     | needs real Supabase                                        |
| Security headers: CSP, HSTS, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, COOP | `next.config.ts`                                                            | e2e                                                        |
| No caching of private pages                                                                      | proxy `Cache-Control: private, no-store`; service worker never caches pages | e2e (service worker headers)                               |
| Local data wiped on sign-out                                                                     | `clearLocalAvenData()` + `Clear-Site-Data`                                  | unit (wipe), manual for browser                            |
| Account enumeration resistance                                                                   | identical responses for sign-up / reset whether or not the account exists   | code review                                                |
| Secret scanning                                                                                  | `npm run check:secrets` in CI                                               | yes                                                        |
| Finance isolation (read, edit, delete, post into another user's account/budget/goal, guess ids)  | RLS + function ownership checks + triggers                                  | `tests/db/finance.test.ts`, e2e                            |
| No direct finance table writes                                                                   | SELECT-only grants                                                          | DB tests                                                   |
| Idempotent sync, incl. concurrent duplicate delivery                                             | receipts + advisory lock                                                    | DB + e2e tests                                             |
| Conflict detection (never overwrite)                                                             | `version` + `base_version`                                                  | DB + e2e tests                                             |
| Sync endpoint: Origin check (fails closed), session check, rate limit (120/min), per-item Zod    | `src/app/api/sync/route.ts`                                                 | e2e (401/403)                                              |
| Finance Server Actions rate-limited (120/min)                                                    | `consume_rate_limit('finance_write')`                                       | code review                                                |
| Password reset can't bypass re-authentication                                                    | HMAC-signed recovery cookie                                                 | unit tests                                                 |
| Sign-out warns before discarding unsynced data                                                   | `SignOutButton`                                                             | manual                                                     |
| Environment validation                                                                           | `src/lib/env.ts`, rejects a secret key in a public variable                 | unit                                                       |

## Stage 3–5 controls (Walrus, Sui, intelligence)

| Control                                                                                                                       | Where                                         | Tested                            |
| ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | --------------------------------- |
| Per-user memory namespace from the verified session, HMAC so ids aren't exposed                                               | `src/lib/memory/namespace.ts`, `runtime.ts`   | unit (mock: B can't recall A)     |
| No SDK call without consent, while paused, or for unsafe content                                                              | `evaluateMemoryCandidate`, `canRecall`        | unit (spies prove zero SDK calls) |
| Sensitive-content guard (emails, card/account numbers, IBANs, keys, credentials, phones)                                      | `findUnsafeContent`                           | unit                              |
| Consent requires acknowledged disclosures (client + server check), new policy version                                         | consent toggle, `setConsentAction`, migration | e2e + DB                          |
| `memory_records` read-only for users; forgotten can't be restored; outbox erased when stored                                  | migration + triggers + CHECKs                 | DB tests                          |
| Relayer namespace mismatch is never linked to a user                                                                          | `refreshMemoryJobs`                           | unit                              |
| Wallets: address format CHECK, ≤ 5 per user, only label editable, RLS                                                         | migration                                     | DB tests                          |
| On-chain import only via `import_chain_transaction()`: digest unique, near-duplicate confirm, wallet ownership, finance rules | migration                                     | DB tests                          |
| Imports re-verified on Sui (digest exists and changed this wallet's balance)                                                  | wallet actions                                | code review (needs Tatum)         |
| Recommendations: users create only open ones for themselves; answers via function, once                                       | migration                                     | DB tests                          |
| Rate limits: memory read/write, chain read/import, wallet changes, recommendation answers                                     | `RATE_LIMITS`                                 | code review                       |
| Provider errors shown without secrets (long tokens redacted)                                                                  | `describeMemwalError`, `classifySuiError`     | unit                              |
| New routes protected (`/intelligence/*`, `/money/wallets`, `/settings/integrations`)                                          | `PROTECTED_PREFIXES` + layout `getUser()`     | unit + e2e                        |
| Secret scanner knows MemWal/Sui/Tatum key shapes                                                                              | `scripts/check-secrets.mjs`                   | CI                                |
| Account deletion records external state honestly (Walrus retained-unreachable, counts only)                                   | `describeExternalCleanup`                     | code review                       |

## Planning, Wellbeing and Nudge Center controls

| Control                                                                                                                                                   | Where                       | Tested                   |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ------------------------ |
| RLS on all 17 new tables; two-user isolation for every user-owned one                                                                                     | migrations                  | DB (`rls.test.ts`) + e2e |
| No direct writes: users have SELECT only; every write via `apply_life_mutation()` (column whitelist, version check, idempotent receipts)                  | `20261104000200`            | DB (`life.test.ts`)      |
| Ownership guards: a task can't use another user's category; check-ins/exceptions only on your own habit/event; `user_id` immutable                        | triggers                    | DB                       |
| Wellbeing records require `wellbeing_data` consent **in the database**; deleting always allowed                                                           | `apply_life_mutation()`     | DB + e2e                 |
| Zod validation of every payload (Server Actions and `/api/sync`); offline task edits are status-only                                                      | `src/lib/life/schemas.ts`   | unit + DB                |
| Notifications: users can change only `read_at` / `dismissed_at`; action links must be internal paths                                                      | column grant + CHECK        | DB + e2e                 |
| Scheduler endpoint requires `CRON_SECRET` (≥ 32 chars, constant-time compare); 503 when unset                                                             | `/api/cron/nudges`          | unit                     |
| `scheduler_runs` closed to users; `scheduler_status()` reveals only the last run time and success                                                         | migration                   | DB                       |
| Memory: planning/wellbeing summaries only, banded, per-category consent, existing policy gate and sensitive-content guard; never logs, notes or meal text | `src/lib/life/memory*.ts`   | unit                     |
| Memory correction = forget original (irreversible) + store user's statement through the same gate                                                         | `correctMemoryAction`       | code review              |
| Rate limits: `life_write` and `notification_update` (120/min)                                                                                             | `RATE_LIMITS`               | code review              |
| Secret scanner knows `CRON_SECRET` assignments                                                                                                            | `scripts/check-secrets.mjs` | CI                       |

## Secrets handling

- Never put real values in the repo. `.env*` files are git-ignored; `.env.example` has names only.
- Enter secrets in **Vercel → Project → Settings → Environment Variables**.
- Never paste keys into chat, issues or screenshots. If a key leaks, rotate it in Supabase
  (Settings → API Keys) and update Vercel.
- **MemWal delegate key leaked:** revoke/replace the delegate key at memory.walrus.xyz and
  update `MEMWAL_PRIVATE_KEY`. **Do not** change `MEMWAL_NAMESPACE_SECRET` unless you accept
  that existing memories become unreachable.
- **Tatum key leaked:** delete it in the Tatum dashboard, create a new one, update Vercel.
- **`SMTP_PASSWORD` leaked:** revoke the Gmail app password (or provider key), create a new one, update Vercel.
- **`CRON_SECRET` leaked:** pick a new one and update it in both Vercel and the GitHub
  repository secret. The worst a leaked value allows is running the (idempotent) scheduler early.

## Stage 2 review findings (fixed)

1. `/reset-password` let any signed-in session set a new password without the current one.
   It now requires a 15-minute HMAC-signed HttpOnly cookie that is only set by a password-reset
   email link.
2. Users could insert `sync_receipts` directly. Now only the database function writes them.
3. Sign-out wiped unsynced offline data silently. It now warns and offers to sync first.

## Known limitations / planned hardening

- Walrus memories cannot be deleted through the MemWal SDK; AVEN suppresses them and
  discloses this. AVEN's delegate key can decrypt every user's memories (single operator
  account). Both are stated before consent.
- The live Walrus and Tatum paths are verified only when you run `verify:walrus` /
  `verify:tatum`; automated tests use the official MemWal mock and mocked Sui responses.

- CSP allows inline scripts (needed by Next.js without nonces). Move to nonce-based CSP.
- No error monitoring service yet.
- Supabase's built-in email sender has low hourly limits; configure custom SMTP before launch.
- "Leaked password protection" (HaveIBeenPwned) and MFA are available in Supabase and should be
  reviewed for launch.
- Audit log entries for sign-in are best-effort (a logging failure never blocks sign-in).
- Offline data in IndexedDB (queued changes, cached account and category names) is not encrypted
  at rest beyond the operating system's protection; it is wiped on sign-out.
