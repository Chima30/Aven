# Database

Supabase PostgreSQL is AVEN's **authoritative store**. Migrations live in
`supabase/migrations/` and must be applied in filename order. `supabase/setup_all_in_one.sql`
is a generated bundle of all of them, and `supabase/upgrades/stageN.sql` holds each stage on
its own for existing projects (regenerate both with `npm run db:bundle`).

| Migration                                        | Contents                                                                                                                                                                                                                                                    |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `20261031000100_foundation.sql`                  | `private` schema, `currencies`, `profiles`, `user_preferences`                                                                                                                                                                                              |
| `20261031000200_consent_audit_notifications.sql` | `audit_log`, consent tables and `set_consent()`, notification preferences                                                                                                                                                                                   |
| `20261031000300_ai_limits_sync_data_rights.sql`  | AI limits/usage, rate limiting, devices, sync receipts, export log, deletion log                                                                                                                                                                            |
| `20261031000400_new_user_bootstrap.sql`          | Sign-up trigger that creates default rows; deletion clean-up trigger                                                                                                                                                                                        |
| `20261101000100_finance_tables.sql`              | Accounts, categories (+ defaults), transactions, budgets, goals, goal entries, finance events; ownership/currency triggers; sync receipts made function-only                                                                                                |
| `20261101000200_finance_mutations.sql`           | `apply_finance_mutation()` (the only finance write path), event producers, `record_sync_completed()`                                                                                                                                                        |
| `20261101000300_finance_reads.sql`               | `account_balances`, `savings_goal_progress`, summaries, cash flow, budget progress/history, `list_transactions`                                                                                                                                             |
| `20261102000100_walrus_memory.sql`               | `memory_records` (Walrus bookkeeping, server-written, outbox CHECK, irreversible forget); `memory_financial` consent available (policy `2026-11-02`)                                                                                                        |
| `20261102000200_sui_wallets.sql`                 | `sui_wallets` (read-only addresses, ≤ 5), `chain_imports`, `import_chain_transaction()` with digest and near-duplicate checks                                                                                                                               |
| `20261103000100_recommendations.sql`             | `recommendations` (inbox + answers, memory influence), `respond_to_recommendation()`                                                                                                                                                                        |
| `20261104000100_planning_wellbeing_tables.sql`   | Planning (tasks, categories, calendar events + exceptions, habits + check-ins, reviews, preferences) and Wellbeing (sleep, water, meals, activity, mood, preferences); ownership guards; wellbeing/planning memory consents available (policy `2026-11-04`) |
| `20261104000200_life_mutations_events.sql`       | `apply_life_mutation()` (the only write path for those records), `life_events`, `notifications`, `scheduler_runs`, `scheduler_status()`, "suggestions" notification category, new memory kinds                                                              |

## Access model

- **RLS is enabled on every table in `public`** (a test fails otherwise).
- `anon` (signed-out visitors) has **no access** to any user table. Only `currencies` is public.
- `authenticated` gets only the privileges it needs, often **column-level** (e.g. users can
  update `display_name` and `country_code` on `profiles`, nothing else).
- Owner policies use `(select auth.uid())` (evaluated once per query, per Supabase guidance).
- Tables with RLS enabled and **no** policies are completely closed to users
  (`rate_limit_buckets`, `account_deletion_log`).
- Helper functions that bypass RLS live in the `private` schema, which the Supabase Data API
  does not expose. Every `SECURITY DEFINER` function sets `search_path = ''` (tested).

## Tables

| Table                                                                 | Purpose                                                                                       | User can                                | Written by                                                                |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------- |
| `currencies`                                                          | ISO 4217 codes + decimal places                                                               | read (incl. signed-out)                 | migrations                                                                |
| `profiles`                                                            | display name, country                                                                         | read/update own (2 columns)             | sign-up trigger                                                           |
| `user_preferences`                                                    | currency, locale, time zone, week start, formats, units, theme, `ai_enabled`, `memory_paused` | read/update own                         | sign-up trigger, settings                                                 |
| `notification_preferences`                                            | channels, digests, quiet hours, pause, daily cap                                              | read/update own                         | sign-up trigger, settings                                                 |
| `notification_category_preferences`                                   | frequency per topic; `account_security` can't be `off`                                        | read/update own `frequency`             | sign-up trigger, settings                                                 |
| `consent_categories`                                                  | catalogue; `is_available=false` locks Walrus memory categories                                | read                                    | migrations                                                                |
| `consent_records`                                                     | append-only consent history                                                                   | read own                                | `set_consent()` only                                                      |
| `consent_state`                                                       | current consent per category                                                                  | read own                                | `set_consent()` only                                                      |
| `audit_log`                                                           | security/privacy events                                                                       | read own                                | triggers, `log_security_event()`, `set_consent()`, `record_data_export()` |
| `ai_usage_limits`                                                     | per-user AI quotas                                                                            | read own                                | sign-up trigger, admins                                                   |
| `ai_usage_daily`                                                      | AI requests and tokens per UTC day                                                            | read own                                | `record_ai_usage()` (service role only)                                   |
| `rate_limit_buckets`                                                  | fixed-window counters                                                                         | nothing                                 | `consume_rate_limit()`                                                    |
| `user_devices`                                                        | devices that sync offline data                                                                | full CRUD on own                        | registered by `apply_finance_mutation()`                                  |
| `sync_receipts`                                                       | one row per mutation id with the stored response — makes retries idempotent                   | read own                                | `apply_finance_mutation()` only                                           |
| `data_export_log`                                                     | record that an export happened                                                                | read own                                | `record_data_export()`                                                    |
| `financial_accounts`                                                  | accounts, opening balance, archive                                                            | read own                                | `apply_finance_mutation()`                                                |
| `transaction_categories`                                              | per-user categories (18 defaults seeded)                                                      | read own                                | `apply_finance_mutation()`, sign-up trigger                               |
| `transactions`                                                        | income/expense/transfer, client-generated ids, versions                                       | read own                                | `apply_finance_mutation()`                                                |
| `budgets`                                                             | monthly limits                                                                                | read own                                | `apply_finance_mutation()`                                                |
| `savings_goals`, `savings_goal_entries`                               | goals and tracking entries                                                                    | read own                                | `apply_finance_mutation()`                                                |
| `finance_events`                                                      | de-duplicated facts for Stage 3 nudges                                                        | read own                                | database functions only                                                   |
| `memory_records`                                                      | Walrus memory bookkeeping: label, kind, content hash, job id/status, blob id, status          | read own                                | server (secret key) after MemWal calls, filtered by session user          |
| `sui_wallets`                                                         | public Sui Mainnet addresses + label (≤ 5)                                                    | read/add/rename/remove own              | the user                                                                  |
| `chain_imports`                                                       | link from an imported Sui digest to an AVEN transaction                                       | read own                                | `import_chain_transaction()` only                                         |
| `recommendations`                                                     | this period's suggestions, explanations, evidence, memory influence and the user's answer     | read own; create open own               | the engine (user session); answers via `respond_to_recommendation()`      |
| `tasks`, `task_categories`                                            | tasks (status, priority, due, reminder) and their categories                                  | read own                                | `apply_life_mutation()`                                                   |
| `calendar_events`, `calendar_event_exceptions`                        | events (timed or all-day, own time zone, recurrence) and cancelled occurrences                | read own                                | `apply_life_mutation()`                                                   |
| `habits`, `habit_check_ins`                                           | habits and one check-in per local day (never future)                                          | read own                                | `apply_life_mutation()`                                                   |
| `reviews`                                                             | private daily/weekly reviews, one per period                                                  | read own                                | `apply_life_mutation()`                                                   |
| `planning_preferences`, `wellbeing_preferences`                       | review times; units and targets                                                               | read/insert/update own                  | the user                                                                  |
| `sleep_logs`, `water_logs`, `meal_logs`, `activity_logs`, `mood_logs` | wellbeing logs in canonical units (instants, ml, metres); Pulse Checks in `mood_logs`         | read own                                | `apply_life_mutation()` — **requires `wellbeing_data` consent**           |
| `life_events`                                                         | de-duplicated facts (task completed, habit checked in, review saved, wellbeing logged)        | read own                                | `apply_life_mutation()` only                                              |
| `notifications`                                                       | Nudge Center items with status (delivered / scheduled / bundled / suppressed) and reason      | read own; set `read_at`, `dismissed_at` | the scheduler (secret key)                                                |
| `scheduler_runs`                                                      | when the background scheduler ran                                                             | nothing (see `scheduler_status()`)      | the scheduler (secret key)                                                |
| `account_deletion_log`                                                | **anonymous** proof of deletion (SHA-256 of user id, outcome, external cleanup counts)        | nothing                                 | server (secret key)                                                       |

## Functions callable by signed-in users

| Function                                                                                                                | What it does                                                                                                                                 |
| ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `set_consent(category, granted, source)`                                                                                | Records history, updates state, audits. Refuses to grant unavailable categories.                                                             |
| `log_security_event(action)`                                                                                            | Allow-listed events only (sign-in, sign-out, password changes…).                                                                             |
| `consume_rate_limit(action, max, window)`                                                                               | Returns `false` when over the limit.                                                                                                         |
| `record_data_export(format, bytes)`                                                                                     | Logs an export and audits it.                                                                                                                |
| `ai_quota_status()`                                                                                                     | Whether AI may run now: AI switch on **and** consent **and** under limits.                                                                   |
| `apply_finance_mutation(...)`                                                                                           | The only finance write path: idempotent, versioned, ownership-checked (see FINANCE.md).                                                      |
| `record_sync_completed(batch, count)`                                                                                   | One de-duplicated event per offline sync batch.                                                                                              |
| `import_chain_transaction(mutation, wallet, digest, tx id, payload, confirm)`                                           | Confirmed on-chain import through `apply_finance_mutation()`; refuses repeats, asks on near-duplicates.                                      |
| `respond_to_recommendation(id, action, value, note)`                                                                    | Records accept / decline / change exactly once.                                                                                              |
| `apply_life_mutation(mutation, entity, op, id, payload, base_version, device)`                                          | The only write path for Planning and Wellbeing: idempotent, versioned, column-whitelisted, ownership-checked, consent-checked for wellbeing. |
| `scheduler_status()`                                                                                                    | When the background scheduler last ran and whether it succeeded — nothing else.                                                              |
| `finance_summary`, `spending_by_category`, `monthly_cashflow`, `budget_progress`, `budget_history`, `list_transactions` | Read models (SECURITY INVOKER, RLS applies; money as text).                                                                                  |

## New users

`private.handle_new_user()` runs after Supabase Auth inserts a user and creates: profile,
preferences, notification preferences and categories, AI limits, and a `consent_state` row
for every category set to **not granted**. It creates **no financial, wellbeing or sample data**.

## Account deletion and retention

Deleting the Supabase Auth user cascades through `profiles` to every user-owned table, and a
trigger removes rate-limit buckets. A database test proves no row remains for the deleted user.

**Shared expenses (Stage 4) — planned retention model.** Group records belong to the _group_,
not to one member. When a member deletes their account, their personal rows are deleted, their
membership is removed, and their `user_id` on shared expense/settlement rows is set to `NULL`
with a neutral "Former member" label, so other members keep an accurate history without
retaining the departed person's identity. This will be implemented and tested in Stage 4.

**External stores (Stage 6+)** need their own deletion jobs. A future
`external_deletion_jobs` table (not keyed to `profiles`, so it survives the cascade) will track
each external deletion until the provider confirms it. AVEN will not claim external data is
deleted without that confirmation.

## Regenerating TypeScript types

`src/lib/supabase/database.types.ts` is written by hand to match the migrations. Once the
Supabase CLI is set up you can regenerate it:
`npx supabase gen types typescript --project-id <ref> > src/lib/supabase/database.types.ts`.
