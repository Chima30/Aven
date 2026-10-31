# Testing

## Suites

| Command                         | What it covers                                                                                                                                                                                                                                                                                                                                                      | Needs                       |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| `npm run check:secrets`         | No key-shaped strings or `.env` files committed; `.env.example` holds names only                                                                                                                                                                                                                                                                                    | —                           |
| `npm run typecheck`             | TypeScript strict (+ `noUncheckedIndexedAccess`)                                                                                                                                                                                                                                                                                                                    | —                           |
| `npm run lint` / `format:check` | ESLint (Next.js rules), Prettier                                                                                                                                                                                                                                                                                                                                    | —                           |
| `npm test`                      | **Unit:** currency precision and money maths, env validation, open-redirect and CSRF guards, route classification, nudge rules and time zones/DST, offline outbox + sync engine (fake IndexedDB), memory policy gate, consent catalogue, regional formatting                                                                                                        | —                           |
| `npm run test:db`               | **Database:** every migration on PostgreSQL 16 with a small Supabase shim; RLS isolation between two users for every user-owned table; anonymous access denied; protected columns; consent, audit, rate limit, AI quota, sync idempotency; account deletion removes every row and keeps only an anonymous log; all-in-one SQL bundle is current and applies cleanly | PostgreSQL (CI provides it) |
| `npm run test:e2e`              | **Browser (desktop + mobile):** public pages, 404, skip link, theme, protected-route redirects, open-redirect, server-side form validation, password toggle, security headers, sign-out/export CSRF refusal, PWA manifest and service worker                                                                                                                        | `npm run build` first       |

The database shim (`tests/db/supabase-shim.sql`) recreates Supabase's roles, `auth.users`,
`auth.uid()` and Supabase's permissive default grants, so the tests prove the migrations'
own `REVOKE`s and policies work. As a sanity check, a deliberately leaky policy was
introduced during development and the RLS tests caught it.

## Stage 1 results, actually executed 31 Oct 2026 in the build environment

| Check                                                | Result                                                        |
| ---------------------------------------------------- | ------------------------------------------------------------- |
| Secret scan                                          | ✅ No secrets found                                           |
| TypeScript                                           | ✅ 0 errors                                                   |
| ESLint                                               | ✅ 0 errors, 0 warnings                                       |
| Prettier                                             | ✅ all files formatted                                        |
| Unit tests (Vitest)                                  | ✅ 103 / 103 passed (6 files)                                 |
| Database & RLS tests (Vitest + PostgreSQL 16.15)     | ✅ 62 / 62 passed (3 files)                                   |
| Production build (`next build`, Next 16.4.3)         | ✅ succeeded, 27 routes                                       |
| End-to-end (Playwright, Chromium, desktop + Pixel 7) | ✅ 36 / 36 passed                                             |
| `npm audit --omit=dev` (production dependencies)     | ✅ 0 vulnerabilities (16 moderate in dev-only ESLint tooling) |

## Not verified in Stage 1 (needs your Supabase project)

These depend on a live Supabase Auth server, which the build environment doesn't have:

- Real sign-up, email confirmation, sign-in, password reset and email delivery.
- Sign out everywhere actually revoking other sessions.
- Server-verified re-authentication, password change and account deletion through Supabase's Admin API.
- Migrations on real Supabase (tested on plain PostgreSQL 16 with a shim of the Supabase pieces they use).
- The GitHub Actions workflow itself (written, but first runs when you push).
- Vercel deployment.
- Service worker offline behaviour in a real installed PWA.

The [deployment smoke test](DEPLOYMENT.md#5-smoke-test-about-5-minutes) covers the first three
by hand. Automated signed-in tests against a dedicated Supabase test project are planned once
that project exists.

## Running database tests locally (developers)

```bash
# any PostgreSQL 15+ that you can create databases on
TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres npm run test:db
```
