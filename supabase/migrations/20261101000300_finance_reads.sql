-- =============================================================================
-- AVEN Stage 2 — Migration 7: Finance read models
--
-- Every view/function here is SECURITY INVOKER: it runs as the signed-in user,
-- so Row Level Security limits results to that user's own rows.
-- Aggregated money is returned as TEXT so large sums stay exact in JavaScript.
-- Transfers are NEVER counted as income or expenses.
-- =============================================================================

-- Balance = opening balance + income − expenses − transfers out + transfers in.
create view public.account_balances
with (security_invoker = true)
as
select
  a.id as account_id,
  a.user_id,
  a.currency_code,
  (a.opening_balance_minor + coalesce(sum(
    case
      when t.kind = 'income' then t.amount_minor
      when t.kind = 'expense' then -t.amount_minor
      when t.kind = 'transfer' and t.account_id = a.id then -t.amount_minor
      when t.kind = 'transfer' and t.transfer_account_id = a.id then t.amount_minor
      else 0
    end), 0))::text as balance_minor,
  count(t.id)::integer as transaction_count,
  max(t.occurred_on) as last_activity_on
from public.financial_accounts a
left join public.transactions t
  on t.user_id = a.user_id and (t.account_id = a.id or t.transfer_account_id = a.id)
group by a.id;

revoke all on public.account_balances from anon, authenticated;
grant select on public.account_balances to authenticated;

create view public.savings_goal_progress
with (security_invoker = true)
as
select
  g.id as goal_id,
  g.user_id,
  coalesce(sum(case when e.kind = 'contribution' then e.amount_minor else -e.amount_minor end), 0)::text as saved_minor,
  count(e.id)::integer as entry_count
from public.savings_goals g
left join public.savings_goal_entries e on e.goal_id = g.id
group by g.id;

revoke all on public.savings_goal_progress from anon, authenticated;
grant select on public.savings_goal_progress to authenticated;

-- Income / expense / net per currency for a date range (inclusive).
create or replace function public.finance_summary(p_from date, p_to date)
returns table (
  currency_code text,
  income_minor text,
  expense_minor text,
  net_minor text,
  transaction_count integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    t.currency_code,
    coalesce(sum(t.amount_minor) filter (where t.kind = 'income'), 0)::text,
    coalesce(sum(t.amount_minor) filter (where t.kind = 'expense'), 0)::text,
    (coalesce(sum(t.amount_minor) filter (where t.kind = 'income'), 0)
      - coalesce(sum(t.amount_minor) filter (where t.kind = 'expense'), 0))::text,
    count(*)::integer
  from public.transactions t
  where t.kind in ('income', 'expense') and t.occurred_on between p_from and p_to
  group by t.currency_code
  order by t.currency_code;
$$;

create or replace function public.spending_by_category(p_from date, p_to date)
returns table (
  currency_code text,
  category_id uuid,
  category_name text,
  expense_minor text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select t.currency_code, t.category_id, coalesce(c.name, 'Uncategorised'), sum(t.amount_minor)::text
  from public.transactions t
  left join public.transaction_categories c on c.id = t.category_id
  where t.kind = 'expense' and t.occurred_on between p_from and p_to
  group by t.currency_code, t.category_id, c.name
  order by t.currency_code, sum(t.amount_minor) desc;
$$;

-- Month-by-month income and expenses for the last p_months months ending at p_today's month.
create or replace function public.monthly_cashflow(p_months integer, p_today date)
returns table (
  month date,
  currency_code text,
  income_minor text,
  expense_minor text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with bounds as (
    select date_trunc('month', p_today)::date as last_month,
           (date_trunc('month', p_today) - make_interval(months => greatest(1, least(p_months, 24)) - 1))::date as first_month
  ),
  currencies as (
    select distinct t.currency_code from public.transactions t, bounds b
    where t.kind in ('income', 'expense') and t.occurred_on >= b.first_month
  ),
  months as (
    select generate_series(b.first_month, b.last_month, interval '1 month')::date as month from bounds b
  )
  select m.month, c.currency_code,
    coalesce(sum(t.amount_minor) filter (where t.kind = 'income'), 0)::text,
    coalesce(sum(t.amount_minor) filter (where t.kind = 'expense'), 0)::text
  from months m
  cross join currencies c
  left join public.transactions t
    on t.currency_code = c.currency_code and t.kind in ('income', 'expense')
    and t.occurred_on >= m.month and t.occurred_on < (m.month + interval '1 month')
  group by m.month, c.currency_code
  order by c.currency_code, m.month;
$$;

-- Spending against each budget for one month. Expenses only; matching currency only.
create or replace function public.budget_progress(p_month date, p_include_archived boolean default false)
returns table (
  budget_id uuid,
  name text,
  category_id uuid,
  category_name text,
  currency_code text,
  limit_minor text,
  spent_minor text,
  alert_threshold_pct smallint,
  starts_on date,
  archived boolean,
  version bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select b.id, b.name, b.category_id, c.name, b.currency_code, b.limit_minor::text,
    coalesce((
      select sum(t.amount_minor) from public.transactions t
      where t.user_id = b.user_id and t.kind = 'expense' and t.currency_code = b.currency_code
        and t.occurred_on >= date_trunc('month', p_month)::date
        and t.occurred_on < (date_trunc('month', p_month) + interval '1 month')::date
        and (b.category_id is null or t.category_id = b.category_id)
    ), 0)::text,
    b.alert_threshold_pct, b.starts_on, b.archived_at is not null, b.version
  from public.budgets b
  left join public.transaction_categories c on c.id = b.category_id
  where (p_include_archived or b.archived_at is null)
  order by b.archived_at nulls first, b.name;
$$;

create or replace function public.budget_history(p_budget_id uuid, p_months integer, p_today date)
returns table (month date, spent_minor text, limit_minor text)
language sql
stable
security invoker
set search_path = ''
as $$
  with b as (select * from public.budgets where id = p_budget_id),
  months as (
    select generate_series(
      greatest((select starts_on from b),
        (date_trunc('month', p_today) - make_interval(months => greatest(1, least(p_months, 24)) - 1))::date),
      date_trunc('month', p_today)::date,
      interval '1 month')::date as month
  )
  select m.month,
    coalesce((
      select sum(t.amount_minor) from public.transactions t, b
      where t.kind = 'expense' and t.currency_code = b.currency_code
        and t.occurred_on >= m.month and t.occurred_on < (m.month + interval '1 month')
        and (b.category_id is null or t.category_id = b.category_id)
    ), 0)::text,
    (select limit_minor from b)::text
  from months m
  where exists (select 1 from b)
  order by m.month desc;
$$;

-- Searchable, filterable, sortable transaction list with names and total count.
create or replace function public.list_transactions(
  p_q text default null,
  p_kind text default null,
  p_account_id uuid default null,
  p_category_id uuid default null,
  p_from date default null,
  p_to date default null,
  p_sort text default 'date_desc',
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  kind text,
  account_id uuid,
  account_name text,
  transfer_account_id uuid,
  transfer_account_name text,
  amount_minor bigint,
  currency_code text,
  category_id uuid,
  category_name text,
  description text,
  merchant text,
  notes text,
  occurred_on date,
  version bigint,
  created_at timestamptz,
  updated_at timestamptz,
  total_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select t.id, t.kind, t.account_id, a.name, t.transfer_account_id, ta.name, t.amount_minor, t.currency_code,
    t.category_id, c.name, t.description, t.merchant, t.notes, t.occurred_on, t.version, t.created_at,
    t.updated_at, count(*) over ()
  from public.transactions t
  join public.financial_accounts a on a.id = t.account_id
  left join public.financial_accounts ta on ta.id = t.transfer_account_id
  left join public.transaction_categories c on c.id = t.category_id
  where (p_kind is null or t.kind = p_kind)
    and (p_account_id is null or t.account_id = p_account_id or t.transfer_account_id = p_account_id)
    and (p_category_id is null or t.category_id = p_category_id)
    and (p_from is null or t.occurred_on >= p_from)
    and (p_to is null or t.occurred_on <= p_to)
    and (
      p_q is null or btrim(p_q) = ''
      or position(lower(btrim(p_q)) in lower(
        coalesce(t.description, '') || ' ' || coalesce(t.merchant, '') || ' ' || coalesce(t.notes, '')
        || ' ' || coalesce(c.name, ''))) > 0
    )
  order by
    case when p_sort = 'amount_desc' then t.amount_minor end desc nulls last,
    case when p_sort = 'amount_asc' then t.amount_minor end asc nulls last,
    case when p_sort = 'date_asc' then t.occurred_on end asc nulls last,
    t.occurred_on desc, t.created_at desc
  limit greatest(1, least(p_limit, 200)) offset greatest(0, p_offset);
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.finance_summary(date, date)',
    'public.spending_by_category(date, date)',
    'public.monthly_cashflow(integer, date)',
    'public.budget_progress(date, boolean)',
    'public.budget_history(uuid, integer, date)',
    'public.list_transactions(text, text, uuid, uuid, date, date, text, integer, integer)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end
$$;
