# Database

Supabase PostgreSQL is AVEN's **authoritative store**. Migrations live in
`supabase/migrations/` and must be applied in filename order. `supabase/stage1_all_in_one.sql`
is a generated bundle of all of them (regenerate with `npm run db:bundle`).

| Migration                                        | Contents                                                                         |
| ------------------------------------------------ | -------------------------------------------------------------------------------- |
| `20261031000100_foundation.sql`                  | `private` schema, `currencies`, `profiles`, `user_preferences`                   |
| `20261031000200_consent_audit_notifications.sql` | `audit_log`, consent tables and `set_consent()`, notification preferences        |
| `20261031000300_ai_limits_sync_data_rights.sql`  | AI limits/usage, rate limiting, devices, sync receipts, export log, deletion log |
| `20261031000400_new_user_bootstrap.sql`          | Sign-up trigger that creates default rows; deletion clean-up trigger             |

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

| Table                               | Purpose                                                                                       | User can                    | Written by                                                                |
| ----------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------- |
| `currencies`                        | ISO 4217 codes + decimal places                                                               | read (incl. signed-out)     | migrations                                                                |
| `profiles`                          | display name, country                                                                         | read/update own (2 columns) | sign-up trigger                                                           |
| `user_preferences`                  | currency, locale, time zone, week start, formats, units, theme, `ai_enabled`, `memory_paused` | read/update own             | sign-up trigger, settings                                                 |
| `notification_preferences`          | channels, digests, quiet hours, pause, daily cap                                              | read/update own             | sign-up trigger, settings                                                 |
| `notification_category_preferences` | frequency per topic; `account_security` can't be `off`                                        | read/update own `frequency` | sign-up trigger, settings                                                 |
| `consent_categories`                | catalogue; `is_available=false` locks Walrus memory categories                                | read                        | migrations                                                                |
| `consent_records`                   | append-only consent history                                                                   | read own                    | `set_consent()` only                                                      |
| `consent_state`                     | current consent per category                                                                  | read own                    | `set_consent()` only                                                      |
| `audit_log`                         | security/privacy events                                                                       | read own                    | triggers, `log_security_event()`, `set_consent()`, `record_data_export()` |
| `ai_usage_limits`                   | per-user AI quotas                                                                            | read own                    | sign-up trigger, admins                                                   |
| `ai_usage_daily`                    | AI requests and tokens per UTC day                                                            | read own                    | `record_ai_usage()` (service role only)                                   |
| `rate_limit_buckets`                | fixed-window counters                                                                         | nothing                     | `consume_rate_limit()`                                                    |
| `user_devices`                      | devices that sync offline data                                                                | full CRUD on own            | app (Stage 2)                                                             |
| `sync_receipts`                     | one row per offline mutation id — makes retries idempotent                                    | read/insert own             | app (Stage 2)                                                             |
| `data_export_log`                   | record that an export happened                                                                | read own                    | `record_data_export()`                                                    |
| `account_deletion_log`              | **anonymous** proof of deletion (SHA-256 of user id, outcome)                                 | nothing                     | server (secret key)                                                       |

## Functions callable by signed-in users

| Function                                  | What it does                                                                     |
| ----------------------------------------- | -------------------------------------------------------------------------------- |
| `set_consent(category, granted, source)`  | Records history, updates state, audits. Refuses to grant unavailable categories. |
| `log_security_event(action)`              | Allow-listed events only (sign-in, sign-out, password changes…).                 |
| `consume_rate_limit(action, max, window)` | Returns `false` when over the limit.                                             |
| `record_data_export(format, bytes)`       | Logs an export and audits it.                                                    |
| `ai_quota_status()`                       | Whether AI may run now: AI switch on **and** consent **and** under limits.       |

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
