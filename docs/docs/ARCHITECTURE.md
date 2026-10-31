# Architecture

This document describes the architecture through Stage 4 (Walrus Memory, Tatum Sui and the
intelligence engine). Finance details are in [FINANCE.md](FINANCE.md); offline sync in
[OFFLINE.md](OFFLINE.md); memory in [MEMORY.md](MEMORY.md); the engine in
[INTELLIGENCE.md](INTELLIGENCE.md).

```
                          ┌──────────────── AVEN server (Vercel, Node runtime) ────────────────┐
 Browser ── session ──►   │ Server Components / Actions                                         │
                          │   ├─ Supabase (user session, RLS) ── records, recommendations       │
                          │   ├─ intelligence/  analyse → recall → recommend → explain          │
                          │   ├─ memory/        MemWal SDK ── HTTPS ──► MemWal relayer ──► Walrus│
                          │   │                  (delegate key + HMAC namespaces: server only)  │
                          │   └─ sui/           @mysten/sui gRPC ── x-api-key ──► Tatum ──► Sui  │
                          └─────────────────────────────────────────────────────────────────────┘
```

## 1. Project structure

```
src/
  app/
    (marketing)/        Landing page, privacy and terms drafts (public)
    (auth)/             Sign in, sign up, check email, forgot/reset password, auth-error
    (app)/              Signed-in area: /overview, /money/*, /intelligence/*, /settings/*
      money/              Dashboard, transactions, accounts, budgets, goals, categories, sync
      money/wallets/        Read-only Sui wallets + confirmed on-chain imports (actions.ts)
      intelligence/         Insights & recommendations; Walrus Memory management (actions.ts)
      settings/integrations/  Live health of Walrus relayer and Tatum Sui gateway
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
    integrations/             optional MemWal / Tatum config (server-only) and health checks
    memory/                   Walrus Memory: text format, policy gate, HMAC namespaces, MemWal
                              client, service (remember/refresh/recall/forget), repository
    intelligence/             deterministic analysis, learning signals from recalled memories,
                              recommendations with explanations, memory candidates
    sui/                      address utils, @mysten/sui readers (gRPC / gRPC-web / JSON-RPC),
                              caching + error classification
    data/export.ts            user data export
  proxy.ts               Session refresh + optimistic route protection (Next 16 "proxy")
supabase/
  migrations/            10 ordered SQL migrations (source of truth)
  setup_all_in_one.sql   Generated: every migration, for a brand-new project
  upgrades/stageN.sql    Generated: one stage's migrations, for an existing project
tests/
  unit/                  Vitest unit tests
  db/                    RLS and database function tests against real PostgreSQL
  e2e/                   Playwright: public flows + signed-in finance and offline sync
  e2e/support/fake-supabase.mjs   Test-only Supabase HTTP stand-in over real Postgres
  live/                  OPTIONAL Walrus/Tatum Mainnet checks with your own credentials
verification/            Evidence files written by the live checks
```

## 2. Request flow and data access

```
Browser ──► proxy.ts ──► Server Component / Server Action / Route Handler ──► Supabase (user session) ──► Postgres + RLS
              │ refresh session cookie                    │
              │ redirect signed-out users                 └─► getUser() verifies the session with Supabase Auth
```

- **Normal reads and writes always use the signed-in user's session**, so Postgres Row Level
  Security decides what is visible. The user id is never taken from form input.
- **The admin (secret-key) client is used in three narrow places**: account deletion (after
  server-verified re-authentication), writing `memory_records` (job ids, blob ids and statuses
  come from the MemWal relayer and must not be forgeable by users), and linking a
  recommendation to its outcome memory. Every admin query is filtered by the session's user id.
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
motion support. Unbuilt sections appear in navigation as non-clickable "Later" labels.

## 6. Offline-first

See [OFFLINE.md](OFFLINE.md). Since Stage 2, every transaction change goes through the
IndexedDB outbox and syncs through `/api/sync`, with idempotent server writes, retries,
conflict resolution, projected balances and a working offline page.

## 7. Nudge Center preparation

See [NUDGE_CENTER.md](NUDGE_CENTER.md). Preferences and the deterministic delivery engine
exist since Stage 1; Stage 2 adds de-duplicated `finance_events` (budget threshold/exceeded,
savings milestones, sync failed/completed). No notifications are sent yet.

## 8. Walrus Memory

See [MEMORY.md](MEMORY.md). Memory text lives on Walrus Mainnet (encrypted by the MemWal
relayer); Supabase keeps only bookkeeping (label, content hash, job id, blob id, status) and a
short-lived outbox copy while a write is in flight. Every write passes the policy gate
(consent, pause, durability, sensitive-content guard); every recall is limited to the signed-in
user's HMAC namespace and drops forgotten memories.

## 9. Intelligence and the learning loop

See [INTELLIGENCE.md](INTELLIGENCE.md). On each visit to /intelligence:

1. Load the user's records (RLS) and analyse them deterministically (completed months only for
   history; fixed charges are not projected).
2. Recall the user's memories from Walrus (3 queries, merged) and parse them into learning
   signals: past outcomes per suggestion, savings target, repeatedly overspent categories.
3. Build recommendations; each records which recalled memory changed it (`memory_influence`).
4. The user accepts, declines or changes the amount → `respond_to_recommendation()` → the
   outcome is written to Walrus → next time it is recalled and changes the suggestion.
5. Pattern memories from completed months are written to Walrus in the background (`after()`),
   deduplicated by content hash.

## 10. Sui via Tatum

See [TATUM_SETUP.md](TATUM_SETUP.md). The official `@mysten/sui` gRPC client runs on the
server with Tatum's API key as `x-api-key` metadata. Results are cached briefly; errors are
classified (unauthorized / rate limited / unsupported / unavailable) and shown in plain words.
On-chain data is displayed separately; it becomes an AVEN transaction only through
`import_chain_transaction()` after the user confirms it, with digest and near-duplicate checks.

## 11. Key decisions and trade-offs

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
| Walrus text, Supabase bookkeeping only           | Walrus is the real long-term memory; Supabase can show status without duplicating content                                       | Showing memory text needs a recall round-trip to the relayer      |
| One MemWal account, HMAC namespaces per user     | Users need no wallet; namespaces can't be chosen by requests or linked to user ids                                              | AVEN's delegate key can read every user's memories (disclosed)    |
| "Forget" = suppression                           | The MemWal SDK has no delete; suppression by blob id **and** content hash is enforceable                                        | Encrypted copies remain on Walrus (disclosed before consent)      |
| Deterministic engine, no AI model                | Numbers can't be invented; explanations are reproducible and testable                                                           | Less flexible language than an LLM                                |
| Sui gRPC instead of JSON-RPC                     | JSON-RPC is deprecated and disabled on Foundation Mainnet nodes                                                                 | Needs the Node runtime (HTTP/2); gRPC-web/JSON-RPC as fallbacks   |
