# Security

## Boundaries

| Boundary              | Rule                                                                                                                                                                                      |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Browser ↔ server      | The browser only ever has the Supabase **publishable** key. Secrets are read in `src/lib/env.server.ts`, which imports `server-only` so the build fails if a Client Component imports it. |
| Server ↔ database     | Normal operations use the **user's session**, so RLS applies.                                                                                                                             |
| Admin access          | The Supabase **secret** key is used only in `src/lib/supabase/admin.ts`, called only by `deleteAccountAction` (delete auth user, write anonymous deletion log).                           |
| AI provider (Stage 6) | Anthropic key server-only; requests only when `ai_enabled` + `ai_processing` consent + quota (`ai_quota_status()`).                                                                       |
| Walrus (Stage 6)      | Credentials server-only; writes only through the memory policy gate. Not integrated in Stage 1.                                                                                           |

## Implemented controls (Stage 1)

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
| Environment validation                                                                           | `src/lib/env.ts`, rejects a secret key in a public variable                 | unit                                                       |

## Secrets handling

- Never put real values in the repo. `.env*` files are git-ignored; `.env.example` has names only.
- Enter secrets in **Vercel → Project → Settings → Environment Variables**.
- Never paste keys into chat, issues or screenshots. If a key leaks, rotate it in Supabase
  (Settings → API Keys) and update Vercel.

## Known limitations / planned hardening (Stage 8)

- CSP allows inline scripts (needed by Next.js without nonces). Move to nonce-based CSP.
- No error monitoring service yet.
- Supabase's built-in email sender has low hourly limits; configure custom SMTP before launch.
- "Leaked password protection" (HaveIBeenPwned) and MFA are available in Supabase and should be
  reviewed for launch.
- Audit log entries for sign-in are best-effort (a logging failure never blocks sign-in).
