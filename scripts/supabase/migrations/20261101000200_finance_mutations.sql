-- =============================================================================
-- AVEN Stage 2 — Migration 6: The finance write path
--
-- public.apply_finance_mutation() is the ONLY way to change finance data.
-- For every call it:
--   1. identifies the user from the session (auth.uid()), never from input;
--   2. serialises calls with the same mutation id and replays the stored
--      response if that mutation was already processed (idempotency);
--   3. checks ownership of every referenced record explicitly;
--   4. enforces optimistic concurrency (base_version must match);
--   5. turns rule violations into a clean "rejected" result (no data leaks);
--   6. stores a receipt with the exact response, all in ONE transaction.
-- =============================================================================

create or replace function private.result(p_status text, p_extra jsonb default '{}'::jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$ select jsonb_build_object('status', p_status) || coalesce(p_extra, '{}'::jsonb) $$;

create or replace function private.jtext(p jsonb, k text)
returns text
language sql
immutable
set search_path = ''
as $$ select nullif(btrim(p ->> k), '') $$;

-- -----------------------------------------------------------------------------
-- Finance event producers (deterministic; dedupe keys prevent repeats)
-- -----------------------------------------------------------------------------
create or replace function private.check_budget_events(
  p_user uuid, p_currency text, p_category uuid, p_on date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_month date := date_trunc('month', p_on)::date;
  v_budget public.budgets%rowtype;
  v_spent bigint;
  v_key text;
begin
  for v_budget in
    select * from public.budgets b
    where b.user_id = p_user and b.archived_at is null and b.currency_code = p_currency
      and b.starts_on <= v_month
      and (b.category_id is null or b.category_id = p_category)
  loop
    select coalesce(sum(t.amount_minor), 0) into v_spent
    from public.transactions t
    where t.user_id = p_user and t.kind = 'expense' and t.currency_code = p_currency
      and t.occurred_on >= v_month and t.occurred_on < (v_month + interval '1 month')
      and (v_budget.category_id is null or t.category_id = v_budget.category_id);

    v_key := 'budget:' || v_budget.id || ':' || to_char(v_month, 'YYYY-MM');
    if v_spent > v_budget.limit_minor then
      perform private.record_finance_event(p_user, 'budget_exceeded', v_key || ':exceeded',
        jsonb_build_object('budget_id', v_budget.id, 'month', v_month,
          'spent_minor', v_spent::text, 'limit_minor', v_budget.limit_minor::text, 'currency_code', p_currency));
    elsif v_spent * 100 >= v_budget.limit_minor * v_budget.alert_threshold_pct then
      perform private.record_finance_event(p_user, 'budget_threshold_reached', v_key || ':threshold',
        jsonb_build_object('budget_id', v_budget.id, 'month', v_month, 'threshold_pct', v_budget.alert_threshold_pct,
          'spent_minor', v_spent::text, 'limit_minor', v_budget.limit_minor::text, 'currency_code', p_currency));
    end if;
  end loop;
end;
$$;
revoke all on function private.check_budget_events(uuid, text, uuid, date) from public;

create or replace function private.check_goal_milestones(p_user uuid, p_goal uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_goal public.savings_goals%rowtype;
  v_saved bigint;
  v_pct integer;
begin
  select * into v_goal from public.savings_goals where id = p_goal and user_id = p_user;
  if not found then return; end if;
  select coalesce(sum(case when kind = 'contribution' then amount_minor else -amount_minor end), 0)
    into v_saved from public.savings_goal_entries where goal_id = p_goal;
  foreach v_pct in array array[25, 50, 75, 100] loop
    if v_saved * 100 >= v_goal.target_minor * v_pct then
      perform private.record_finance_event(p_user, 'savings_milestone_reached',
        'goal:' || p_goal || ':milestone:' || v_pct,
        jsonb_build_object('goal_id', p_goal, 'milestone_pct', v_pct, 'saved_minor', v_saved::text,
          'target_minor', v_goal.target_minor::text, 'currency_code', v_goal.currency_code));
    end if;
  end loop;
end;
$$;
revoke all on function private.check_goal_milestones(uuid, uuid) from public;

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------
create or replace function private.require_active_account(p_user uuid, p_account uuid, p_allow_archived uuid default null)
returns public.financial_accounts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.financial_accounts%rowtype;
begin
  select * into v from public.financial_accounts where id = p_account and user_id = p_user;
  if not found then
    raise exception 'Account not found' using errcode = '42501';
  end if;
  if v.archived_at is not null and p_account is distinct from p_allow_archived then
    raise exception 'This account is archived. Restore it before adding transactions.' using errcode = 'P0001';
  end if;
  return v;
end;
$$;
revoke all on function private.require_active_account(uuid, uuid, uuid) from public;

-- -----------------------------------------------------------------------------
-- Entity handlers
-- -----------------------------------------------------------------------------
create or replace function private.fin_transaction(
  p_user uuid, p_op text, p_id uuid, p jsonb, p_base bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.transactions%rowtype;
  v_account public.financial_accounts%rowtype;
  v_kind text := private.jtext(p, 'kind');
  v_transfer uuid := private.jtext(p, 'transfer_account_id')::uuid;
begin
  if p_op in ('update', 'delete') then
    select * into v_row from public.transactions where id = p_id and user_id = p_user for update;
    if not found then
      if p_op = 'delete' then
        return private.result('applied', jsonb_build_object('note', 'already_deleted'));
      end if;
      return private.result('conflict', jsonb_build_object('reason', 'not_found',
        'message', 'This transaction no longer exists on the server.'));
    end if;
    if p_base is null or p_base <> v_row.version then
      return private.result('conflict', jsonb_build_object('reason', 'version',
        'message', 'This transaction was changed somewhere else.',
        'server_version', v_row.version, 'record', to_jsonb(v_row)));
    end if;
    if p_op = 'delete' then
      delete from public.transactions where id = p_id;
      return private.result('applied', jsonb_build_object('server_version', v_row.version));
    end if;
  else
    if exists (select 1 from public.transactions where id = p_id) then
      select * into v_row from public.transactions where id = p_id and user_id = p_user;
      if found then
        return private.result('conflict', jsonb_build_object('reason', 'exists',
          'message', 'A transaction with this id already exists.',
          'server_version', v_row.version, 'record', to_jsonb(v_row)));
      end if;
      raise exception 'Not found' using errcode = '42501';
    end if;
  end if;

  -- Accounts must belong to the user; archived accounts only allowed if unchanged.
  v_account := private.require_active_account(p_user, private.jtext(p, 'account_id')::uuid,
    case when p_op = 'update' then v_row.account_id end);
  if v_kind = 'transfer' then
    perform private.require_active_account(p_user, v_transfer,
      case when p_op = 'update' then v_row.transfer_account_id end);
  end if;
  -- The amount was entered with this currency's precision; it must match the account.
  if private.jtext(p, 'currency_code') is distinct from v_account.currency_code then
    raise exception 'Currency does not match the account' using errcode = '22023';
  end if;

  if p_op = 'create' then
    insert into public.transactions (
      id, user_id, kind, account_id, transfer_account_id, amount_minor, currency_code,
      category_id, description, merchant, notes, occurred_on
    ) values (
      p_id, p_user, v_kind, v_account.id, v_transfer, (p ->> 'amount_minor')::bigint, v_account.currency_code,
      private.jtext(p, 'category_id')::uuid, private.jtext(p, 'description'), private.jtext(p, 'merchant'),
      private.jtext(p, 'notes'), (p ->> 'occurred_on')::date
    ) returning * into v_row;
  else
    update public.transactions set
      kind = v_kind,
      account_id = v_account.id,
      transfer_account_id = v_transfer,
      amount_minor = (p ->> 'amount_minor')::bigint,
      currency_code = v_account.currency_code,
      category_id = private.jtext(p, 'category_id')::uuid,
      description = private.jtext(p, 'description'),
      merchant = private.jtext(p, 'merchant'),
      notes = private.jtext(p, 'notes'),
      occurred_on = (p ->> 'occurred_on')::date
    where id = p_id
    returning * into v_row;
  end if;

  if v_row.kind = 'expense' then
    perform private.check_budget_events(p_user, v_row.currency_code, v_row.category_id, v_row.occurred_on);
  end if;
  return private.result('applied', jsonb_build_object('server_version', v_row.version, 'record', to_jsonb(v_row)));
end;
$$;
revoke all on function private.fin_transaction(uuid, text, uuid, jsonb, bigint) from public;

create or replace function private.fin_account(p_user uuid, p_op text, p_id uuid, p jsonb, p_base bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.financial_accounts%rowtype;
begin
  if p_op = 'create' then
    if exists (select 1 from public.financial_accounts where id = p_id) then
      raise exception 'Not found' using errcode = '42501';
    end if;
    insert into public.financial_accounts (id, user_id, name, account_type, currency_code, opening_balance_minor, description)
    values (p_id, p_user, btrim(p ->> 'name'), p ->> 'account_type', p ->> 'currency_code',
      coalesce((p ->> 'opening_balance_minor')::bigint, 0), private.jtext(p, 'description'))
    returning * into v_row;
  else
    select * into v_row from public.financial_accounts where id = p_id and user_id = p_user for update;
    if not found then
      return private.result('conflict', jsonb_build_object('reason', 'not_found', 'message', 'Account not found.'));
    end if;
    if p_base is null or p_base <> v_row.version then
      return private.result('conflict', jsonb_build_object('reason', 'version',
        'message', 'This account was changed somewhere else.', 'server_version', v_row.version, 'record', to_jsonb(v_row)));
    end if;
    update public.financial_accounts set
      name = coalesce(btrim(p ->> 'name'), name),
      account_type = coalesce(p ->> 'account_type', account_type),
      opening_balance_minor = coalesce((p ->> 'opening_balance_minor')::bigint, opening_balance_minor),
      description = case when p ? 'description' then private.jtext(p, 'description') else description end,
      archived_at = case
        when (p ->> 'archived')::boolean is true then coalesce(archived_at, now())
        when (p ->> 'archived')::boolean is false then null
        else archived_at end
    where id = p_id returning * into v_row;
  end if;
  return private.result('applied', jsonb_build_object('server_version', v_row.version, 'record', to_jsonb(v_row)));
end;
$$;
revoke all on function private.fin_account(uuid, text, uuid, jsonb, bigint) from public;

create or replace function private.fin_category(p_user uuid, p_op text, p_id uuid, p jsonb, p_base bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.transaction_categories%rowtype;
begin
  if p_op = 'create' then
    if exists (select 1 from public.transaction_categories where id = p_id) then
      raise exception 'Not found' using errcode = '42501';
    end if;
    insert into public.transaction_categories (id, user_id, kind, name)
    values (p_id, p_user, p ->> 'kind', btrim(p ->> 'name'))
    returning * into v_row;
  else
    select * into v_row from public.transaction_categories where id = p_id and user_id = p_user for update;
    if not found then
      return private.result('conflict', jsonb_build_object('reason', 'not_found', 'message', 'Category not found.'));
    end if;
    if p_base is null or p_base <> v_row.version then
      return private.result('conflict', jsonb_build_object('reason', 'version',
        'message', 'This category was changed somewhere else.', 'server_version', v_row.version, 'record', to_jsonb(v_row)));
    end if;
    update public.transaction_categories set
      name = coalesce(btrim(p ->> 'name'), name),
      archived_at = case
        when (p ->> 'archived')::boolean is true then coalesce(archived_at, now())
        when (p ->> 'archived')::boolean is false then null
        else archived_at end
    where id = p_id returning * into v_row;
  end if;
  return private.result('applied', jsonb_build_object('server_version', v_row.version, 'record', to_jsonb(v_row)));
end;
$$;
revoke all on function private.fin_category(uuid, text, uuid, jsonb, bigint) from public;

create or replace function private.fin_budget(p_user uuid, p_op text, p_id uuid, p jsonb, p_base bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.budgets%rowtype;
begin
  if p_op = 'create' then
    if exists (select 1 from public.budgets where id = p_id) then
      raise exception 'Not found' using errcode = '42501';
    end if;
    insert into public.budgets (id, user_id, name, category_id, currency_code, limit_minor, alert_threshold_pct, starts_on)
    values (p_id, p_user, btrim(p ->> 'name'), private.jtext(p, 'category_id')::uuid, p ->> 'currency_code',
      (p ->> 'limit_minor')::bigint, coalesce((p ->> 'alert_threshold_pct')::smallint, 80),
      date_trunc('month', (p ->> 'starts_on')::date)::date)
    returning * into v_row;
  else
    select * into v_row from public.budgets where id = p_id and user_id = p_user for update;
    if not found then
      return private.result('conflict', jsonb_build_object('reason', 'not_found', 'message', 'Budget not found.'));
    end if;
    if p_base is null or p_base <> v_row.version then
      return private.result('conflict', jsonb_build_object('reason', 'version',
        'message', 'This budget was changed somewhere else.', 'server_version', v_row.version, 'record', to_jsonb(v_row)));
    end if;
    update public.budgets set
      name = coalesce(btrim(p ->> 'name'), name),
      limit_minor = coalesce((p ->> 'limit_minor')::bigint, limit_minor),
      alert_threshold_pct = coalesce((p ->> 'alert_threshold_pct')::smallint, alert_threshold_pct),
      archived_at = case
        when (p ->> 'archived')::boolean is true then coalesce(archived_at, now())
        when (p ->> 'archived')::boolean is false then null
        else archived_at end
    where id = p_id returning * into v_row;
  end if;
  return private.result('applied', jsonb_build_object('server_version', v_row.version, 'record', to_jsonb(v_row)));
end;
$$;
revoke all on function private.fin_budget(uuid, text, uuid, jsonb, bigint) from public;

create or replace function private.fin_goal(p_user uuid, p_op text, p_id uuid, p jsonb, p_base bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.savings_goals%rowtype;
begin
  if p_op = 'create' then
    if exists (select 1 from public.savings_goals where id = p_id) then
      raise exception 'Not found' using errcode = '42501';
    end if;
    insert into public.savings_goals (id, user_id, name, currency_code, target_minor, target_date, description)
    values (p_id, p_user, btrim(p ->> 'name'), p ->> 'currency_code', (p ->> 'target_minor')::bigint,
      private.jtext(p, 'target_date')::date, private.jtext(p, 'description'))
    returning * into v_row;
  else
    select * into v_row from public.savings_goals where id = p_id and user_id = p_user for update;
    if not found then
      return private.result('conflict', jsonb_build_object('reason', 'not_found', 'message', 'Goal not found.'));
    end if;
    if p_base is null or p_base <> v_row.version then
      return private.result('conflict', jsonb_build_object('reason', 'version',
        'message', 'This goal was changed somewhere else.', 'server_version', v_row.version, 'record', to_jsonb(v_row)));
    end if;
    update public.savings_goals set
      name = coalesce(btrim(p ->> 'name'), name),
      target_minor = coalesce((p ->> 'target_minor')::bigint, target_minor),
      target_date = case when p ? 'target_date' then private.jtext(p, 'target_date')::date else target_date end,
      description = case when p ? 'description' then private.jtext(p, 'description') else description end,
      status = coalesce(p ->> 'status', status)
    where id = p_id returning * into v_row;
  end if;
  return private.result('applied', jsonb_build_object('server_version', v_row.version, 'record', to_jsonb(v_row)));
end;
$$;
revoke all on function private.fin_goal(uuid, text, uuid, jsonb, bigint) from public;

create or replace function private.fin_goal_entry(p_user uuid, p_op text, p_id uuid, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.savings_goal_entries%rowtype;
  v_goal public.savings_goals%rowtype;
  v_saved bigint;
begin
  if p_op = 'delete' then
    select * into v_row from public.savings_goal_entries where id = p_id and user_id = p_user for update;
    if not found then
      return private.result('applied', jsonb_build_object('note', 'already_deleted'));
    end if;
    -- Removing a contribution must not leave the goal with a negative saved amount.
    if v_row.kind = 'contribution' then
      perform 1 from public.savings_goals where id = v_row.goal_id for update;
      select coalesce(sum(case when kind = 'contribution' then amount_minor else -amount_minor end), 0)
        into v_saved from public.savings_goal_entries where goal_id = v_row.goal_id;
      if v_saved - v_row.amount_minor < 0 then
        raise exception 'Remove the later withdrawals first: this would make the saved amount negative.'
          using errcode = 'P0001';
      end if;
    end if;
    delete from public.savings_goal_entries where id = p_id;
    return private.result('applied');
  end if;

  if exists (select 1 from public.savings_goal_entries where id = p_id) then
    raise exception 'Not found' using errcode = '42501';
  end if;
  select * into v_goal from public.savings_goals where id = (p ->> 'goal_id')::uuid and user_id = p_user;
  if not found then
    raise exception 'Goal not found' using errcode = '42501';
  end if;
  if v_goal.status = 'archived' then
    raise exception 'This goal is archived.' using errcode = 'P0001';
  end if;
  insert into public.savings_goal_entries (id, user_id, goal_id, kind, amount_minor, occurred_on, note)
  values (p_id, p_user, v_goal.id, p ->> 'kind', (p ->> 'amount_minor')::bigint,
    (p ->> 'occurred_on')::date, private.jtext(p, 'note'))
  returning * into v_row;
  if v_row.kind = 'contribution' then
    perform private.check_goal_milestones(p_user, v_goal.id);
  end if;
  return private.result('applied', jsonb_build_object('record', to_jsonb(v_row)));
end;
$$;
revoke all on function private.fin_goal_entry(uuid, text, uuid, jsonb) from public;

-- -----------------------------------------------------------------------------
-- The public entry point
-- -----------------------------------------------------------------------------
create or replace function public.apply_finance_mutation(
  p_mutation_id uuid,
  p_entity text,
  p_operation text,
  p_record_id uuid,
  p_payload jsonb,
  p_base_version bigint default null,
  p_device_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_existing jsonb;
  v_result jsonb;
  v_device uuid;
  v_message text;
begin
  if v_user is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_mutation_id is null or p_record_id is null then
    raise exception 'Mutation and record ids are required' using errcode = '22023';
  end if;
  if not (
    (p_entity = 'transaction' and p_operation in ('create', 'update', 'delete'))
    or (p_entity in ('financial_account', 'category', 'budget', 'savings_goal') and p_operation in ('create', 'update'))
    or (p_entity = 'savings_goal_entry' and p_operation in ('create', 'delete'))
  ) then
    raise exception 'Unsupported mutation: % %', p_entity, p_operation using errcode = '22023';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' or pg_column_size(p_payload) > 8192 then
    raise exception 'Invalid payload' using errcode = '22023';
  end if;

  -- Serialise concurrent deliveries of the same mutation, then replay if already done.
  perform pg_advisory_xact_lock(hashtextextended(v_user::text || ':' || p_mutation_id::text, 0));
  select r.response into v_existing
  from public.sync_receipts r
  where r.user_id = v_user and r.client_mutation_id = p_mutation_id;
  if found then
    return coalesce(v_existing, private.result('applied')) || jsonb_build_object('replayed', true);
  end if;

  -- Register the device (ignored if the id belongs to someone else).
  if p_device_id is not null then
    insert into public.user_devices (id, user_id) values (p_device_id, v_user)
    on conflict (id) do update set last_seen_at = now(), last_sync_at = now()
      where public.user_devices.user_id = v_user;
    select id into v_device from public.user_devices where id = p_device_id and user_id = v_user;
  end if;

  begin
    v_result := case p_entity
      when 'transaction' then private.fin_transaction(v_user, p_operation, p_record_id, p_payload, p_base_version)
      when 'financial_account' then private.fin_account(v_user, p_operation, p_record_id, p_payload, p_base_version)
      when 'category' then private.fin_category(v_user, p_operation, p_record_id, p_payload, p_base_version)
      when 'budget' then private.fin_budget(v_user, p_operation, p_record_id, p_payload, p_base_version)
      when 'savings_goal' then private.fin_goal(v_user, p_operation, p_record_id, p_payload, p_base_version)
      when 'savings_goal_entry' then private.fin_goal_entry(v_user, p_operation, p_record_id, p_payload)
    end;
  exception
    when insufficient_privilege then
      -- Never reveal whether a record exists for another user.
      v_result := private.result('rejected', jsonb_build_object('message', 'Not found.'));
    when unique_violation then
      v_result := private.result('rejected', jsonb_build_object('message', 'Something with that name already exists.'));
    when check_violation or not_null_violation or foreign_key_violation then
      v_result := private.result('rejected', jsonb_build_object('message', 'Some of the details are not valid.'));
    when invalid_text_representation or numeric_value_out_of_range or invalid_datetime_format
      or datetime_field_overflow or invalid_parameter_value or raise_exception then
      get stacked diagnostics v_message = message_text;
      v_result := private.result('rejected', jsonb_build_object('message', left(v_message, 200)));
  end;

  insert into public.sync_receipts (
    user_id, client_mutation_id, device_id, entity, record_id, operation, result, server_version, response
  ) values (
    v_user, p_mutation_id, v_device, p_entity, p_record_id, p_operation,
    v_result ->> 'status', (v_result ->> 'server_version')::bigint, v_result
  );

  if p_entity = 'transaction' and v_result ->> 'status' <> 'applied' then
    perform private.record_finance_event(v_user, 'sync_failed', 'sync_failed:' || p_mutation_id,
      jsonb_build_object('mutation_id', p_mutation_id, 'record_id', p_record_id,
        'status', v_result ->> 'status', 'reason', v_result ->> 'reason'));
  end if;
  return v_result;
end;
$$;
revoke all on function public.apply_finance_mutation(uuid, text, text, uuid, jsonb, bigint, uuid) from public, anon;
grant execute on function public.apply_finance_mutation(uuid, text, text, uuid, jsonb, bigint, uuid) to authenticated;

-- One "sync completed" fact per offline sync batch (dedupe by batch id).
create or replace function public.record_sync_completed(p_batch_id uuid, p_applied integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_applied is null or p_applied < 1 or p_applied > 1000 then
    raise exception 'Invalid count' using errcode = '22023';
  end if;
  perform private.record_finance_event(v_user, 'sync_completed', 'sync_completed:' || p_batch_id,
    jsonb_build_object('applied', p_applied));
end;
$$;
revoke all on function public.record_sync_completed(uuid, integer) from public, anon;
grant execute on function public.record_sync_completed(uuid, integer) to authenticated;
