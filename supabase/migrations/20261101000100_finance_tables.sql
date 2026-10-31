-- =============================================================================
-- AVEN Stage 2 — Migration 5: Finance tables
--
-- Design rules (see docs/DATABASE.md → "Finance"):
--   * Money is bigint MINOR units + a currency code. Per-row amounts are capped
--     at 9,000,000,000,000,000 so they stay exact in JavaScript.
--   * Balances are NEVER stored. They are calculated from the opening balance
--     plus transactions, so they cannot drift or be double-counted.
--   * A transfer is ONE row naming both accounts, so it is atomic by design.
--   * Users may only READ these tables. Every write goes through
--     public.apply_finance_mutation() (next migration), which validates
--     ownership, enforces versions and records idempotency receipts.
--   * Triggers below re-check cross-table ownership and currency rules on
--     every write, whatever the write path (defence in depth).
-- =============================================================================

-- Shared limit for a single stored amount (fits in JS Number.MAX_SAFE_INTEGER).
create or replace function private.max_amount_minor()
returns bigint
language sql
immutable
set search_path = ''
as $$ select 9000000000000000::bigint $$;

-- Keep a monotonically increasing row version for conflict detection.
create or replace function private.bump_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Financial accounts
-- -----------------------------------------------------------------------------
create table public.financial_accounts (
  id uuid primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  account_type text not null check (
    account_type in ('cash', 'bank', 'savings', 'credit_card', 'digital_wallet', 'other')
  ),
  currency_code text not null references public.currencies (code),
  -- May be negative (e.g. an existing credit-card balance).
  opening_balance_minor bigint not null default 0
    check (abs(opening_balance_minor) <= private.max_amount_minor()),
  description text check (description is null or char_length(description) <= 500),
  archived_at timestamptz,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index financial_accounts_user_idx on public.financial_accounts (user_id);
create unique index financial_accounts_active_name_uniq
  on public.financial_accounts (user_id, lower(btrim(name)))
  where archived_at is null;

-- Currency cannot change once set: existing transactions were recorded in it.
create or replace function private.guard_account_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.currency_code <> old.currency_code then
    raise exception 'An account''s currency cannot be changed' using errcode = '22023';
  end if;
  if new.user_id <> old.user_id then
    raise exception 'Ownership cannot change' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger financial_accounts_guard
  before update on public.financial_accounts
  for each row execute function private.guard_account_update();
create trigger financial_accounts_version
  before update on public.financial_accounts
  for each row execute function private.bump_version();

alter table public.financial_accounts enable row level security;
revoke all on table public.financial_accounts from anon, authenticated;
grant select on table public.financial_accounts to authenticated;
create policy "Users can read their own financial accounts"
  on public.financial_accounts for select to authenticated
  using (user_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- Transaction categories (per-user; defaults are seeded per user and editable)
-- -----------------------------------------------------------------------------
create table public.transaction_categories (
  id uuid primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('income', 'expense')),
  name text not null check (char_length(btrim(name)) between 1 and 50),
  is_default boolean not null default false,
  archived_at timestamptz,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index transaction_categories_user_idx on public.transaction_categories (user_id, kind);
create unique index transaction_categories_active_name_uniq
  on public.transaction_categories (user_id, kind, lower(btrim(name)))
  where archived_at is null;

create or replace function private.guard_category_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.kind <> old.kind then
    raise exception 'A category''s type cannot be changed' using errcode = '22023';
  end if;
  if new.user_id <> old.user_id then
    raise exception 'Ownership cannot change' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger transaction_categories_guard
  before update on public.transaction_categories
  for each row execute function private.guard_category_update();
create trigger transaction_categories_version
  before update on public.transaction_categories
  for each row execute function private.bump_version();

alter table public.transaction_categories enable row level security;
revoke all on table public.transaction_categories from anon, authenticated;
grant select on table public.transaction_categories to authenticated;
create policy "Users can read their own categories"
  on public.transaction_categories for select to authenticated
  using (user_id = (select auth.uid()));

-- Default categories, created for every user.
create or replace function private.seed_default_categories(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.transaction_categories (id, user_id, kind, name, is_default)
  select gen_random_uuid(), p_user_id, d.kind, d.name, true
  from (values
    ('income', 'Salary'), ('income', 'Freelance'), ('income', 'Business'),
    ('income', 'Investments'), ('income', 'Gifts'), ('income', 'Other income'),
    ('expense', 'Food'), ('expense', 'Transport'), ('expense', 'Housing'),
    ('expense', 'Bills'), ('expense', 'Shopping'), ('expense', 'Health'),
    ('expense', 'Education'), ('expense', 'Entertainment'), ('expense', 'Subscriptions'),
    ('expense', 'Travel'), ('expense', 'Personal care'), ('expense', 'Other expenses')
  ) as d(kind, name)
  where not exists (
    select 1 from public.transaction_categories c
    where c.user_id = p_user_id and c.kind = d.kind and lower(c.name) = lower(d.name)
      and c.archived_at is null
  );
end;
$$;
revoke all on function private.seed_default_categories(uuid) from public;

create or replace function private.on_profile_created_seed_categories()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.seed_default_categories(new.id);
  return new;
end;
$$;
revoke all on function private.on_profile_created_seed_categories() from public;

create trigger on_profile_created_seed_categories
  after insert on public.profiles
  for each row execute function private.on_profile_created_seed_categories();

-- Existing Stage 1 users get the defaults too (safe to re-run; skips duplicates).
do $$
declare
  v_id uuid;
begin
  for v_id in select id from public.profiles loop
    perform private.seed_default_categories(v_id);
  end loop;
end
$$;

-- -----------------------------------------------------------------------------
-- Transactions
--   kind = income   : +amount to account_id
--   kind = expense  : -amount from account_id
--   kind = transfer : -amount from account_id, +amount to transfer_account_id
-- -----------------------------------------------------------------------------
create table public.transactions (
  id uuid primary key,  -- generated on the device, stable across offline sync
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('income', 'expense', 'transfer')),
  account_id uuid not null references public.financial_accounts (id) on delete cascade,
  transfer_account_id uuid references public.financial_accounts (id) on delete cascade,
  amount_minor bigint not null check (amount_minor > 0 and amount_minor <= private.max_amount_minor()),
  currency_code text not null references public.currencies (code),
  category_id uuid references public.transaction_categories (id) on delete set null,
  description text check (description is null or char_length(description) <= 200),
  merchant text check (merchant is null or char_length(merchant) <= 120),
  notes text check (notes is null or char_length(notes) <= 1000),
  occurred_on date not null check (occurred_on between date '1970-01-01' and date '2200-12-31'),
  -- Reserved for receipt uploads in a later stage (Supabase Storage path).
  attachment_ref text check (attachment_ref is null or char_length(attachment_ref) <= 500),
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (kind = 'transfer' and transfer_account_id is not null and transfer_account_id <> account_id and category_id is null)
    or (kind <> 'transfer' and transfer_account_id is null)
  )
);

create index transactions_user_date_idx on public.transactions (user_id, occurred_on desc, created_at desc);
create index transactions_account_idx on public.transactions (account_id);
create index transactions_transfer_account_idx on public.transactions (transfer_account_id) where transfer_account_id is not null;
create index transactions_category_idx on public.transactions (category_id) where category_id is not null;

-- Cross-table integrity, enforced on EVERY write path.
create or replace function private.guard_transaction()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_account public.financial_accounts%rowtype;
  v_target public.financial_accounts%rowtype;
  v_category public.transaction_categories%rowtype;
begin
  if tg_op = 'UPDATE' and new.user_id <> old.user_id then
    raise exception 'Ownership cannot change' using errcode = '42501';
  end if;

  select * into v_account from public.financial_accounts where id = new.account_id;
  if not found or v_account.user_id <> new.user_id then
    raise exception 'Account not found' using errcode = '42501';
  end if;
  if new.currency_code <> v_account.currency_code then
    raise exception 'Transaction currency must match the account currency' using errcode = '22023';
  end if;

  if new.kind = 'transfer' then
    select * into v_target from public.financial_accounts where id = new.transfer_account_id;
    if not found or v_target.user_id <> new.user_id then
      raise exception 'Destination account not found' using errcode = '42501';
    end if;
    if v_target.currency_code <> v_account.currency_code then
      raise exception 'Transfers are only allowed between accounts in the same currency'
        using errcode = '22023';
    end if;
  end if;

  if new.category_id is not null then
    select * into v_category from public.transaction_categories where id = new.category_id;
    if not found or v_category.user_id <> new.user_id then
      raise exception 'Category not found' using errcode = '42501';
    end if;
    if v_category.kind <> new.kind then
      raise exception 'Category type does not match the transaction type' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

create trigger transactions_guard
  before insert or update on public.transactions
  for each row execute function private.guard_transaction();
create trigger transactions_version
  before update on public.transactions
  for each row execute function private.bump_version();

alter table public.transactions enable row level security;
revoke all on table public.transactions from anon, authenticated;
grant select on table public.transactions to authenticated;
create policy "Users can read their own transactions"
  on public.transactions for select to authenticated
  using (user_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- Budgets (monthly). category_id NULL = all expenses in that currency.
-- Spending is calculated from expense transactions only.
-- -----------------------------------------------------------------------------
create table public.budgets (
  id uuid primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  category_id uuid references public.transaction_categories (id) on delete cascade,
  currency_code text not null references public.currencies (code),
  limit_minor bigint not null check (limit_minor > 0 and limit_minor <= private.max_amount_minor()),
  alert_threshold_pct smallint not null default 80 check (alert_threshold_pct between 1 and 100),
  starts_on date not null check (extract(day from starts_on) = 1),
  archived_at timestamptz,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index budgets_user_idx on public.budgets (user_id);
create unique index budgets_active_scope_uniq
  on public.budgets (user_id, currency_code, coalesce(category_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where archived_at is null;

create or replace function private.guard_budget()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_category public.transaction_categories%rowtype;
begin
  if tg_op = 'UPDATE' and (new.user_id <> old.user_id or new.currency_code <> old.currency_code) then
    raise exception 'A budget''s owner and currency cannot change' using errcode = '22023';
  end if;
  if new.category_id is not null then
    select * into v_category from public.transaction_categories where id = new.category_id;
    if not found or v_category.user_id <> new.user_id then
      raise exception 'Category not found' using errcode = '42501';
    end if;
    if v_category.kind <> 'expense' then
      raise exception 'Budgets can only track expense categories' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

create trigger budgets_guard
  before insert or update on public.budgets
  for each row execute function private.guard_budget();
create trigger budgets_version
  before update on public.budgets
  for each row execute function private.bump_version();

alter table public.budgets enable row level security;
revoke all on table public.budgets from anon, authenticated;
grant select on table public.budgets to authenticated;
create policy "Users can read their own budgets"
  on public.budgets for select to authenticated
  using (user_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- Savings goals and their entries.
-- Entries are TRACKING RECORDS. They never change any account balance.
-- -----------------------------------------------------------------------------
create table public.savings_goals (
  id uuid primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  currency_code text not null references public.currencies (code),
  target_minor bigint not null check (target_minor > 0 and target_minor <= private.max_amount_minor()),
  target_date date,
  description text check (description is null or char_length(description) <= 500),
  status text not null default 'active' check (status in ('active', 'paused', 'completed', 'archived')),
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index savings_goals_user_idx on public.savings_goals (user_id);

create or replace function private.guard_goal_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.user_id <> old.user_id or new.currency_code <> old.currency_code then
    raise exception 'A goal''s owner and currency cannot change' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger savings_goals_guard
  before update on public.savings_goals
  for each row execute function private.guard_goal_update();
create trigger savings_goals_version
  before update on public.savings_goals
  for each row execute function private.bump_version();

alter table public.savings_goals enable row level security;
revoke all on table public.savings_goals from anon, authenticated;
grant select on table public.savings_goals to authenticated;
create policy "Users can read their own savings goals"
  on public.savings_goals for select to authenticated
  using (user_id = (select auth.uid()));

create table public.savings_goal_entries (
  id uuid primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  goal_id uuid not null references public.savings_goals (id) on delete cascade,
  kind text not null check (kind in ('contribution', 'withdrawal')),
  amount_minor bigint not null check (amount_minor > 0 and amount_minor <= private.max_amount_minor()),
  occurred_on date not null,
  note text check (note is null or char_length(note) <= 200),
  created_at timestamptz not null default now()
);

create index savings_goal_entries_goal_idx on public.savings_goal_entries (goal_id, occurred_on desc);

-- Ownership + "a withdrawal can't exceed what has been saved", race-free:
-- the goal row is locked so two concurrent withdrawals cannot both pass.
create or replace function private.guard_goal_entry()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_goal public.savings_goals%rowtype;
  v_saved bigint;
begin
  select * into v_goal from public.savings_goals where id = new.goal_id for update;
  if not found or v_goal.user_id <> new.user_id then
    raise exception 'Goal not found' using errcode = '42501';
  end if;
  if new.kind = 'withdrawal' then
    select coalesce(sum(case when e.kind = 'contribution' then e.amount_minor else -e.amount_minor end), 0)
      into v_saved
    from public.savings_goal_entries e where e.goal_id = new.goal_id;
    if new.amount_minor > v_saved then
      raise exception 'A withdrawal cannot be larger than the amount saved' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

create trigger savings_goal_entries_guard
  before insert on public.savings_goal_entries
  for each row execute function private.guard_goal_entry();

alter table public.savings_goal_entries enable row level security;
revoke all on table public.savings_goal_entries from anon, authenticated;
grant select on table public.savings_goal_entries to authenticated;
create policy "Users can read their own goal entries"
  on public.savings_goal_entries for select to authenticated
  using (user_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- Finance events: deterministic facts for the future Nudge Center (Stage 3).
-- They are NOT notifications. dedupe_key prevents repeats (no spam).
-- -----------------------------------------------------------------------------
create table public.finance_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in (
    'budget_threshold_reached', 'budget_exceeded', 'savings_milestone_reached',
    'sync_failed', 'sync_completed'
  )),
  dedupe_key text not null check (char_length(dedupe_key) <= 200),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object' and pg_column_size(payload) <= 2048),
  occurred_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (user_id, dedupe_key)
);

create index finance_events_unprocessed_idx on public.finance_events (user_id, occurred_at) where processed_at is null;

alter table public.finance_events enable row level security;
revoke all on table public.finance_events from anon, authenticated;
grant select on table public.finance_events to authenticated;
create policy "Users can read their own finance events"
  on public.finance_events for select to authenticated
  using (user_id = (select auth.uid()));

create or replace function private.record_finance_event(p_user uuid, p_kind text, p_key text, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.finance_events (user_id, kind, dedupe_key, payload)
  values (p_user, p_kind, p_key, coalesce(p_payload, '{}'::jsonb))
  on conflict (user_id, dedupe_key) do nothing;
end;
$$;
revoke all on function private.record_finance_event(uuid, text, text, jsonb) from public;

-- -----------------------------------------------------------------------------
-- Sync receipts: from Stage 2 they are written ONLY by apply_finance_mutation().
-- Store the exact response so a retried mutation gets the identical answer.
-- -----------------------------------------------------------------------------
alter table public.sync_receipts add column response jsonb;
revoke insert on table public.sync_receipts from authenticated;
drop policy "Users can record their own sync receipts" on public.sync_receipts;
