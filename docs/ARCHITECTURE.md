# Architecture

This document describes the architecture through Stage 2. Finance details are in
[FINANCE.md](FINANCE.md); offline sync in [OFFLINE.md](OFFLINE.md).

## 1. Project structure

```
src/
  app/
    (marketing)/        Landing page, privacy and terms drafts (public)
    (auth)/             Sign in, sign up, check email, forgot/reset password, auth-error
    (app)/              Signed-in area: /overview, /money/*, /settings/* (server-verified session)
      money/              Dashboard, transactions, accounts, budgets, goals, categories, sync
      money/actions.ts    Server Actions for accounts, categories, budgets, goals
      settings/actions.ts   All settings Server Actions (profile, regional, consent, delete…)
      settings/data/export/route.ts   JSON export (POST)
    auth/confirm/       Email link handler (token_hash or PKCE code)
    auth/sign-out/      Sign out this device / everywhere (POST, Origin-checked)
    api/sync/           Offline outbox sync endpoint (POST, Origin-checked, rate-limited)
    offline/            Static offline page cached by the service worker
    manifest.ts, icon.svg, apple-icon.png, robots.ts
  components/
    ui/                 Design system: Button, Field, Switch, Card, Alert, Badge, Dialog, Toast…
    shell/              App shell, sidebar navigation (with honest "Stage N" labels)
    settings/, auth/, offline/, marketing/, brand/
  lib/
    env.ts / env.server.ts    Zod-validated environment (server secrets can't reach the browser)
    supabase/                 server / browser / admin clients + database types
    auth/                     session helpers, server-verified re-authentication, route lists
    security/                 open-redirect guard, Origin (CSRF) check, rate limits
    money/                    currencies (ISO 4217 minor units) and exact bigint money maths
    regional/                 countries, locales, time zones, date/number formatting
    validation/schemas.ts     Zod schemas for every form
    consent/                  consent category copy
    nudges/                   deterministic notification rules + time-zone maths
    offline/                  IndexedDB layout, outbox, batch sync engine, controller, transport
    finance/                  amount input, schemas, queue rules, projections, periods, queries
    memory/                   Walrus Memory boundary: types, policy gate, disabled store
    data/export.ts            user data export
  proxy.ts               Session refresh + optimistic route protection (Next 16 "proxy")
supabase/
  migrations/            7 ordered SQL migrations (source of truth)
  setup_all_in_one.sql   Generated: every migration, for a brand-new project
  upgrades/stageN.sql    Generated: one stage's migrations, for an existing project
tests/
  unit/                  Vitest unit tests
  db/                    RLS and database function tests against real PostgreSQL
  e2e/                   Playwright: public flows + signed-in finance and offline sync
  e2e/support/fake-supabase.mjs   Test-only Supabase HTTP stand-in over real Postgres
```

## 2. Request flow and data access

```
Browser ──► proxy.ts ──► Server Component / Server Action / Route Handler ──► Supabase (user session) ──► Postgres + RLS
              │ refresh session cookie                    │
              │ redirect signed-out users                 └─► getUser() verifies the session with Supabase Auth
```

- **Normal reads and writes always use the signed-in user's session**, so Postgres Row Level
  Security decides what is visible. The user id is never taken from form input.
- **The admin (secret-key) client is used in exactly one place**: account deletion
  (`deleteAccountAction`), after server-verified re-authentication.
- **Finance writes have one path**: `apply_finance_mutation()` (ownership checks,
  versions, idempotency receipts). Users have read-only table access. Transactions reach it
  through the IndexedDB outbox and `/api/sync`; other finance entities through Server Actions.
- Sensitive writes that users must not forge (audit log, consent history, AI usage, rate
  limits) go through narrow `SECURITY DEFINER` database functions with fixed `search_path`.

## 3. Authentication and sessions

- Email + password via Supabase Auth, with email confirmation required.
- `@supabase/ssr` stores the session in HTTP cookies. `proxy.ts` refreshes it on each request;
  protected layouts call `supabase.auth.getUser()` (verified with the Auth server, so
  sessions revoked by "sign out everywhere" stop working immediately).
- Email links land on `/auth/confirm`, which accepts both `token_hash` (recommended email
  templates; works across browsers) and `code` (Supabase default PKCE templates).
- Password reset: link → `/auth/confirm` (sets a 15-minute HMAC-signed, HttpOnly recovery
  cookie) → `/reset-password` → other sessions signed out. Without that cookie, signed-in
  users are sent to Settings → Security, which requires the current password. (Fixes a
  Stage 1 bypass found during the Stage 2 review.)
- Sign out: POST `/auth/sign-out` with `scope=local` or `scope=global` (all devices). The
  browser first wipes AVEN's IndexedDB data and caches; the response also sends
  `Clear-Site-Data`.
- Re-authentication for dangerous actions (delete account, change password): the password is
  checked on the server with a throw-away Supabase client, and the returned user id must equal
  the current session's user id.
- Magic links and Google sign-in are deferred (not essential for Stage 1).

## 4. Money and global support

- Amounts are **integer minor units in `bigint`** with a currency code. JPY has 0 decimals,
  USD/NGN/EUR 2, KWD/BHD/OMR 3 (`src/lib/money/currencies.ts`, mirrored in `public.currencies`).
- `parseMoney` rejects over-precise input (e.g. `12.345` USD) instead of rounding.
- `addMoney` throws `CurrencyMismatchError` for different currencies; summaries use
  `totalsByCurrency`. Conversion will require an explicit, dated exchange rate (later stage).
- Regional preferences: country, default currency, locale, time zone (validated by both Intl
  and PostgreSQL), week start, date format, number format, measurement system.
- English UI only for now; all user-facing copy is kept in components so it can be extracted
  for localisation later.

## 5. UI system

Design tokens live in `src/app/globals.css` (deep navy, warm off-white, restrained green; light,
dark and system themes). Theme preference is saved in the database and mirrored in a cookie so
pages render in the right theme without a flash. Components are accessible by default: real
form controls, labels wired to hints/errors, native `<dialog>`, focus rings, skip link, reduced
motion support. Unbuilt sections appear in navigation as non-clickable "Stage N" labels.

## 6. Offline-first

See [OFFLINE.md](OFFLINE.md). Since Stage 2, every transaction change goes through the
IndexedDB outbox and syncs through `/api/sync`, with idempotent server writes, retries,
conflict resolution, projected balances and a working offline page.

## 7. Nudge Center preparation

See [NUDGE_CENTER.md](NUDGE_CENTER.md). Preferences and the deterministic delivery engine
exist since Stage 1; Stage 2 adds de-duplicated `finance_events` (budget threshold/exceeded,
savings milestones, sync failed/completed). No notifications are sent yet.

## 8. Walrus Memory boundary

See [MEMORY.md](MEMORY.md). Stage 1 ships the consent categories (locked until Stage 6), the
`MemoryStore` interface, the `evaluateMemoryCandidate` policy gate, and a `disabledMemoryStore`
that throws on every call. No Walrus code or credentials exist yet.

## 9. Key decisions and trade-offs

| Decision                                         | Why                                                                                                                             | Trade-off                                                         |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Next.js `cacheComponents` off                    | Every app page depends on the user's cookies; the classic dynamic model is simpler and safer for a beginner-maintained codebase | Slightly less static optimisation of public pages                 |
| Server Actions for forms                         | Built-in Origin check (CSRF), progressive enhancement, no client fetch code                                                     | Each form needs a small client wrapper for `useActionState`       |
| Rate limits in Postgres                          | Works across Vercel instances with no extra platform                                                                            | One extra DB round-trip on sensitive actions only                 |
| `getUser()` in layouts                           | Detects revoked sessions immediately                                                                                            | One Auth API call per page render                                 |
| Hand-written DB types                            | No Supabase CLI needed to start                                                                                                 | Must be updated with each migration (or regenerated with the CLI) |
| Balances calculated on read                      | No drift, no double-counting, no race conditions                                                                                | Aggregation per request (fine at personal scale; indexed)         |
| Transfer = one row                               | Atomic by construction                                                                                                          | Shown from both accounts' perspective                             |
| Every transaction via the outbox                 | One code path online and offline; nothing lost mid-request                                                                      | A sync round-trip before the confirmed balance updates            |
| Finance writes via one SECURITY DEFINER function | Single audited write path with idempotency and versions                                                                         | Ownership checks must be explicit (covered by DB tests)           |
| CSP with `'unsafe-inline'` scripts               | Required by Next.js bootstrap without nonces                                                                                    | Nonce-based CSP planned for Stage 8 hardening                     |
