# Testing

## Suites

| Command                                       | What it covers                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Needs                          |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `npm run check:secrets`                       | No key-shaped strings or `.env` files committed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | —                              |
| `npm run typecheck` / `lint` / `format:check` | TypeScript strict, ESLint, Prettier                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | —                              |
| `npm test`                                    | **Unit (138):** money precision; amount entry (decimal separators, 0/2/3-decimal currencies, over-precision, caps); transaction/sync Zod validation; balance effects and projected balances; periods and time zones; outbox persistence, retries/backoff, safe edit/cancel, orphan recovery; batch sync engine (lost-response duplicates, conflicts, auth expiry, incomplete responses); nudge rules; memory gate; env; CSRF/open-redirect guards; recovery cookie                                                                                                                                                                                                                                                                                                                  | —                              |
| `npm run test:db`                             | **Database (119), real PostgreSQL 16:** RLS on every table; two-user isolation for every user-owned table and view; anonymous access denied; finance write path only; income/expense/transfer balances; opening balance counted once; transfer atomicity and same-currency rule; JPY/KWD precision; categories (type match, ownership, uniqueness); idempotent replay incl. concurrent duplicates; version conflicts (never overwrite); safe deletes; ownership attacks with guessed ids; budgets (expenses only, currency/category/month scoping, history, one-time threshold/exceeded events); goals (tracking only, no balance change, race-free withdrawals, milestones); reporting functions; account deletion cascade; SQL bundles (full setup and Stage 1 → Stage 2 upgrade) | PostgreSQL                     |
| `npm run test:e2e`                            | **Browser (54 = 27 × desktop + mobile):** public pages, headers, CSRF, PWA; **signed-in finance against real Postgres + RLS** via the test-only fake Supabase: empty states; online entry; **offline entry → pending display → projected balance → automatic sync exactly once**; **stale offline edit → conflict → resolution**; cross-user access blocked; budgets; **entry from the cached offline page with no connection**                                                                                                                                                                                                                                                                                                                                                     | PostgreSQL, build with e2e env |

### About the fake Supabase used in e2e

`tests/e2e/support/fake-supabase.mjs` imitates only the HTTP layer of Supabase
(a subset of PostgREST and GoTrue). Every query runs on a real PostgreSQL database with
AVEN's real migrations, as the `authenticated` role with the user's JWT claims, so RLS
and every database function behave as in production. It does **not** test real Supabase
Auth (sign-up emails, password checks, token refresh) or PostgREST itself.

## Stage 2 results, actually executed 31 Oct 2026 in the build environment

| Check                                                | Result                                                            |
| ---------------------------------------------------- | ----------------------------------------------------------------- |
| Secret scan                                          | ✅ No secrets found                                               |
| TypeScript (strict)                                  | ✅ 0 errors                                                       |
| ESLint                                               | ✅ 0 errors, 0 warnings                                           |
| Prettier                                             | ✅ all files formatted                                            |
| Unit tests (Vitest)                                  | ✅ 138 / 138 passed                                               |
| Database tests (Vitest + PostgreSQL 16.15)           | ✅ 119 / 119 passed                                               |
| Production build (`next build`, Next 16.4.3)         | ✅ succeeded (35 routes)                                          |
| End-to-end (Playwright, Chromium, desktop + Pixel 7) | ✅ 54 / 54 passed, three consecutive full runs after the last fix |
| `npm audit --omit=dev`                               | ✅ 0 vulnerabilities                                              |

Bugs the new tests found and that were fixed before delivery: amount validation could throw
instead of rejecting a decimal minor-unit value; changes could stay "syncing" when a page was
left mid-request; a frozen previous page could hold the cross-tab sync lock indefinitely.

## Not verified (needs your Supabase project / GitHub / Vercel)

- Real Supabase Auth flows: sign-up email, sign-in, password reset email, sign out everywhere,
  account deletion via the Admin API.
- The migrations and upgrade on real Supabase. They are tested on PostgreSQL 16 with a shim of
  the Supabase pieces they use; Supabase runs PostgreSQL 15+ and `security_invoker` views
  need 15+.
- PostgREST-specific behaviour (the e2e stand-in imitates it).
- GitHub Actions and Vercel deployment (first run when you push).
- Real devices: installing the PWA and offline entry on iOS Safari and Android Chrome.

## Running database tests locally (developers)

```bash
# any PostgreSQL 15+ that you can create databases on
TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres npm run test:db
```
