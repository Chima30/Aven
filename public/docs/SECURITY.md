# Security

## Boundaries

| Boundary              | Rule                                                                                                                                                                                               |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Browser ↔ server      | The browser only ever has the Supabase **publishable** key. Secrets are read in `src/lib/env.server.ts`, which imports `server-only` so the build fails if a Client Component imports it.          |
| Server ↔ database     | Normal operations use the **user's session**, so RLS applies.                                                                                                                                      |
| Finance writes        | Only through `apply_finance_mutation()`: user from the session, explicit ownership checks on every referenced id, optimistic versions, idempotency receipts. Users can only SELECT finance tables. |
| Admin access          | The Supabase **secret** key is used only in `src/lib/supabase/admin.ts`, called only by `deleteAccountAction` (delete auth user, write anonymous deletion log).                                    |
| AI provider (Stage 6) | Anthropic key server-only; requests only when `ai_enabled` + `ai_processing` consent + quota (`ai_quota_status()`).                                                                                |
| Walrus (Stage 6)      | Credentials server-only; writes only through the memory policy gate. Not integrated in Stage 1.                                                                                                    |

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

## Secrets handling

- Never put real values in the repo. `.env*` files are git-ignored; `.env.example` has names only.
- Enter secrets in **Vercel → Project → Settings → Environment Variables**.
- Never paste keys into chat, issues or screenshots. If a key leaks, rotate it in Supabase
  (Settings → API Keys) and update Vercel.

## Stage 2 review findings (fixed)

1. `/reset-password` let any signed-in session set a new password without the current one.
   It now requires a 15-minute HMAC-signed HttpOnly cookie that is only set by a password-reset
   email link.
2. Users could insert `sync_receipts` directly. Now only the database function writes them.
3. Sign-out wiped unsynced offline data silently. It now warns and offers to sync first.

## Known limitations / planned hardening (Stage 8)

- CSP allows inline scripts (needed by Next.js without nonces). Move to nonce-based CSP.
- No error monitoring service yet.
- Supabase's built-in email sender has low hourly limits; configure custom SMTP before launch.
- "Leaked password protection" (HaveIBeenPwned) and MFA are available in Supabase and should be
  reviewed for launch.
- Audit log entries for sign-in are best-effort (a logging failure never blocks sign-in).
- Offline data in IndexedDB (queued changes, cached account and category names) is not encrypted
  at rest beyond the operating system's protection; it is wiped on sign-out.
