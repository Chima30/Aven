-- =============================================================================
-- AVEN Stage 5 — Migration 12: the planning/wellbeing write path and life events
--
-- public.apply_life_mutation() is the ONLY way planning and wellbeing records
-- are written (online, and from the offline outbox through /api/sync). Like
-- apply_finance_mutation() it:
--   1. takes the user from the session (auth.uid()), never from input;
--   2. serialises duplicate deliveries and replays the stored receipt;
--   3. allows only listed entities, operations and columns;
--   4. checks optimistic versions on update/delete (never overwrites);
--   5. refuses wellbeing writes without the `wellbeing_data` consent
--      (deleting your own wellbeing data is always allowed);
--   6. records one de-duplicated life_event per meaningful change, for the
--      Nudge Center and summaries to consume.
-- =============================================================================

-- Which entities exist, the table behind each, and the columns a payload may set.
create table private.life_entities (
  entity text primary key,
  table_name text not null,
  columns text[] not null,
  wellbeing boolean not null default false,
  operations text[] not null default array['create', 'update', 'delete']
);

insert into private.life_entities (entity, table_name, columns, wellbeing, operations) values
  ('task_category', 'task_categories', array['name'], false, array['create', 'update']),
  ('task', 'tasks', array['title', 'description', 'status', 'priority', 'category_id', 'due_on', 'due_time', 'remind_at'], false, array['create', 'update', 'delete']),
  ('calendar_event', 'calendar_events', array['title', 'description', 'category', 'all_day', 'starts_at', 'ends_at', 'start_date', 'end_date', 'time_zone', 'recurrence', 'recurrence_interval', 'recurrence_weekdays', 'recurrence_until', 'reminder_minutes'], false, array['create', 'update', 'delete']),
  ('calendar_event_exception', 'calendar_event_exceptions', array['event_id', 'occurrence_date', 'cancelled', 'starts_at', 'ends_at', 'title'], false, array['create', 'update', 'delete']),
  ('habit', 'habits', array['name', 'description', 'category', 'frequency', 'weekdays', 'start_on', 'end_on', 'reminder_time', 'time_zone'], false, array['create', 'update', 'delete']),
  ('habit_check_in', 'habit_check_ins', array['habit_id', 'on_date', 'status', 'note'], false, array['create', 'update', 'delete']),
  ('review', 'reviews', array['kind', 'period_start', 'highlights', 'missed', 'next_focus', 'notes', 'rating'], false, array['create', 'update', 'delete']),
  ('sleep_log', 'sleep_logs', array['slept_at', 'woke_at', 'wake_date', 'quality', 'note'], true, array['create', 'update', 'delete']),
  ('water_log', 'water_logs', array['amount_ml', 'logged_at', 'local_date'], true, array['create', 'update', 'delete']),
  ('meal_log', 'meal_logs', array['meal_type', 'description', 'eaten_at', 'local_date', 'note'], true, array['create', 'update', 'delete']),
  ('activity_log', 'activity_logs', array['activity_type', 'duration_minutes', 'distance_m', 'intensity', 'on_date', 'note'], true, array['create', 'update', 'delete']),
  ('mood_log', 'mood_logs', array['logged_at', 'local_date', 'mood', 'energy', 'stress', 'sleep_rating', 'day_rating', 'note', 'source'], true, array['create', 'update', 'delete']);

revoke all on table private.life_entities from public;

-- -----------------------------------------------------------------------------
-- Life events: de-duplicated facts other modules consume (Nudge Center,
-- summaries). Producers never notify anyone directly.
-- -----------------------------------------------------------------------------
create table public.life_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (
    kind in ('task_completed', 'habit_checked_in', 'review_saved', 'wellbeing_logged', 'event_scheduled')
  ),
  dedupe_key text not null check (char_length(dedupe_key) between 1 and 200),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object' and pg_column_size(payload) <= 2048),
  occurred_at timestamptz not null default now(),
  processed_at timestamptz,
  constraint life_events_dedupe_uniq unique (user_id, dedupe_key)
);
create index life_events_unprocessed_idx on public.life_events (occurred_at) where processed_at is null;

alter table public.life_events enable row level security;
revoke all on table public.life_events from anon, authenticated;
grant select on table public.life_events to authenticated;
create policy "Users can read their own life events"
  on public.life_events for select to authenticated
  using (user_id = (select auth.uid()));

create or replace function private.record_life_event(p_user uuid, p_kind text, p_key text, p_payload jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.life_events (user_id, kind, dedupe_key, payload)
  values (p_user, p_kind, p_key, coalesce(p_payload, '{}'::jsonb))
  on conflict (user_id, dedupe_key) do nothing;
$$;
revoke all on function private.record_life_event(uuid, text, text, jsonb) from public;

-- -----------------------------------------------------------------------------
-- The write path
-- -----------------------------------------------------------------------------
create or replace function private.life_apply(
  p_user uuid, p_cfg private.life_entities, p_op text, p_id uuid, p jsonb, p_base bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cols text;
  v_vals text;
  v_version bigint;
  v_record jsonb;
  v_exists boolean;
begin
  select string_agg(format('%I', c), ', '), string_agg(format('r.%I', c), ', ')
    into v_cols, v_vals
    from unnest(p_cfg.columns) c where p ? c;

  if p_op = 'create' then
    execute format('select exists (select 1 from public.%I where id = $1)', p_cfg.table_name)
      into v_exists using p_id;
    if v_exists then
      -- Never reveal whether an id belongs to someone else.
      raise exception 'Not found' using errcode = '42501';
    end if;
    execute format(
      'insert into public.%1$I as t (id, user_id%2$s) select $1, $2%3$s from jsonb_populate_record(null::public.%1$I, $3) r returning to_jsonb(t)',
      p_cfg.table_name,
      case when v_cols is null then '' else ', ' || v_cols end,
      case when v_vals is null then '' else ', ' || v_vals end)
      into v_record using p_id, p_user, p;
    return private.result('applied', jsonb_build_object('server_version', (v_record ->> 'version')::bigint, 'record', v_record));
  end if;

  execute format('select version, to_jsonb(t) from public.%I t where id = $1 and user_id = $2 for update', p_cfg.table_name)
    into v_version, v_record using p_id, p_user;
  if v_version is null then
    return private.result('conflict', jsonb_build_object('reason', 'not_found', 'message', 'This item no longer exists.'));
  end if;
  if p_base is null or p_base <> v_version then
    return private.result('conflict', jsonb_build_object('reason', 'version',
      'message', 'This item was changed somewhere else.', 'server_version', v_version, 'record', v_record));
  end if;

  if p_op = 'delete' then
    execute format('delete from public.%I where id = $1 and user_id = $2', p_cfg.table_name) using p_id, p_user;
    return private.result('applied', jsonb_build_object('server_version', v_version, 'deleted', true));
  end if;

  -- update: only the listed columns that are present in the payload change.
  if v_cols is not null then
    execute format(
      'update public.%1$I as t set (%2$s) = (select %3$s from jsonb_populate_record(t, $3) r) where t.id = $1 and t.user_id = $2 returning to_jsonb(t)',
      p_cfg.table_name, v_cols, v_vals)
      into v_record using p_id, p_user, p;
  end if;
  if p ? 'archived' and p_cfg.table_name in ('task_categories', 'habits') then
    execute format(
      'update public.%I as t set archived_at = case when ($3 ->> ''archived'')::boolean then coalesce(archived_at, now()) else null end where t.id = $1 and t.user_id = $2 returning to_jsonb(t)',
      p_cfg.table_name)
      into v_record using p_id, p_user, p;
  elsif v_cols is null then
    execute format('update public.%I as t set updated_at = now() where t.id = $1 and t.user_id = $2 returning to_jsonb(t)', p_cfg.table_name)
      into v_record using p_id, p_user;
  end if;
  return private.result('applied', jsonb_build_object('server_version', (v_record ->> 'version')::bigint, 'record', v_record));
end;
$$;
revoke all on function private.life_apply(uuid, private.life_entities, text, uuid, jsonb, bigint) from public;

create or replace function public.apply_life_mutation(
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
  v_cfg private.life_entities%rowtype;
  v_existing jsonb;
  v_result jsonb;
  v_device uuid;
  v_message text;
  v_record jsonb;
begin
  if v_user is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_mutation_id is null or p_record_id is null then
    raise exception 'Mutation and record ids are required' using errcode = '22023';
  end if;
  select * into v_cfg from private.life_entities where entity = p_entity;
  if not found or not (p_operation = any (v_cfg.operations)) then
    raise exception 'Unsupported mutation: % %', p_entity, p_operation using errcode = '22023';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' or pg_column_size(p_payload) > 16384 then
    raise exception 'Invalid payload' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user::text || ':' || p_mutation_id::text, 0));
  select r.response into v_existing
  from public.sync_receipts r
  where r.user_id = v_user and r.client_mutation_id = p_mutation_id;
  if found then
    return coalesce(v_existing, private.result('applied')) || jsonb_build_object('replayed', true);
  end if;

  if p_device_id is not null then
    insert into public.user_devices (id, user_id) values (p_device_id, v_user)
    on conflict (id) do update set last_seen_at = now(), last_sync_at = now()
      where public.user_devices.user_id = v_user;
    select id into v_device from public.user_devices where id = p_device_id and user_id = v_user;
  end if;

  if v_cfg.wellbeing and p_operation <> 'delete' and not exists (
    select 1 from public.consent_state s
    where s.user_id = v_user and s.category = 'wellbeing_data' and s.granted
  ) then
    v_result := private.result('rejected', jsonb_build_object('reason', 'consent',
      'message', 'Allow "Store wellbeing information" in Settings → Privacy to save wellbeing records.'));
  else
    begin
      v_result := private.life_apply(v_user, v_cfg, p_operation, p_record_id, p_payload, p_base_version);
    exception
      when insufficient_privilege then
        v_result := private.result('rejected', jsonb_build_object('message', 'Not found.'));
      when unique_violation then
        v_result := private.result('rejected', jsonb_build_object('reason', 'exists',
          'message', 'That already exists (for example, a second check-in for the same day).'));
      when check_violation or not_null_violation or foreign_key_violation then
        v_result := private.result('rejected', jsonb_build_object('message', 'Some of the details are not valid.'));
      when invalid_text_representation or numeric_value_out_of_range or invalid_datetime_format
        or datetime_field_overflow or invalid_parameter_value or raise_exception
        or array_subscript_error or datatype_mismatch or invalid_time_zone_displacement_value then
        get stacked diagnostics v_message = message_text;
        v_result := private.result('rejected', jsonb_build_object('message', left(v_message, 200)));
    end;
  end if;

  insert into public.sync_receipts (
    user_id, client_mutation_id, device_id, entity, record_id, operation, result, server_version, response
  ) values (
    v_user, p_mutation_id, v_device, p_entity, p_record_id, p_operation,
    v_result ->> 'status', (v_result ->> 'server_version')::bigint, v_result
  );

  -- Life events for other modules (de-duplicated by key).
  if v_result ->> 'status' = 'applied' and p_operation <> 'delete' then
    v_record := v_result -> 'record';
    if p_entity = 'task' and v_record ->> 'status' = 'completed' then
      perform private.record_life_event(v_user, 'task_completed', 'task_completed:' || p_record_id,
        jsonb_build_object('task_id', p_record_id));
    elsif p_entity = 'habit_check_in' and v_record ->> 'status' = 'done' then
      perform private.record_life_event(v_user, 'habit_checked_in',
        'habit_checked_in:' || (v_record ->> 'habit_id') || ':' || (v_record ->> 'on_date'),
        jsonb_build_object('habit_id', v_record ->> 'habit_id', 'on_date', v_record ->> 'on_date'));
    elsif p_entity = 'review' then
      perform private.record_life_event(v_user, 'review_saved',
        'review_saved:' || (v_record ->> 'kind') || ':' || (v_record ->> 'period_start'),
        jsonb_build_object('kind', v_record ->> 'kind', 'period_start', v_record ->> 'period_start'));
    elsif v_cfg.wellbeing and p_operation = 'create' then
      perform private.record_life_event(v_user, 'wellbeing_logged', 'wellbeing_logged:' || p_record_id,
        jsonb_build_object('entity', p_entity));
    end if;
  end if;
  return v_result;
end;
$$;
revoke all on function public.apply_life_mutation(uuid, text, text, uuid, jsonb, bigint, uuid) from public, anon;
grant execute on function public.apply_life_mutation(uuid, text, text, uuid, jsonb, bigint, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Nudge Center: in-app notifications
-- -----------------------------------------------------------------------------
-- A category for memory-supported suggestions, which users can turn off.
alter table public.notification_category_preferences
  drop constraint notification_category_preferences_category_check;
alter table public.notification_category_preferences
  add constraint notification_category_preferences_category_check check (category in (
    'subscriptions', 'shared_expenses', 'budgets', 'savings',
    'routines', 'wellbeing', 'planning', 'account_security', 'suggestions'
  ));

insert into public.notification_category_preferences (user_id, category, frequency)
select p.id, 'suggestions', 'daily_digest' from public.profiles p
on conflict (user_id, category) do nothing;

create or replace function private.seed_suggestion_preferences()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notification_category_preferences (user_id, category, frequency)
  values (new.id, 'suggestions', 'daily_digest')
  on conflict (user_id, category) do nothing;
  return new;
end;
$$;
revoke all on function private.seed_suggestion_preferences() from public;
create trigger on_profile_created_seed_suggestions
  after insert on public.profiles
  for each row execute function private.seed_suggestion_preferences();

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  category text not null check (category in (
    'subscriptions', 'shared_expenses', 'budgets', 'savings',
    'routines', 'wellbeing', 'planning', 'account_security', 'suggestions'
  )),
  kind text not null check (kind in (
    'task_reminder', 'task_due', 'event_reminder', 'habit_reminder', 'habit_missed',
    'habit_streak', 'review_due', 'daily_summary', 'weekly_summary', 'budget_threshold',
    'budget_exceeded', 'savings_milestone', 'suggestion'
  )),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  body text check (body is null or char_length(body) <= 2000),
  -- Internal links only (never an external URL).
  action_url text check (action_url is null or action_url ~ '^/[A-Za-z0-9/_?=&.%-]*$'),
  related_type text check (related_type is null or related_type ~ '^[a-z_]{1,40}$'),
  related_id uuid,
  -- One notification per occurrence: the scheduler can run any number of times.
  dedupe_key text not null check (char_length(dedupe_key) between 1 and 200),
  -- delivered: visible now · scheduled: waiting (quiet hours) · bundled: only in
  -- a summary · suppressed: blocked by the user's preferences (kept as history).
  status text not null check (status in ('delivered', 'scheduled', 'bundled', 'suppressed')),
  decision_reason text check (decision_reason is null or char_length(decision_reason) <= 60),
  digest text check (digest is null or digest in ('daily', 'weekly')),
  scheduled_for timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  dismissed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notifications_dedupe_uniq unique (user_id, dedupe_key),
  check (status <> 'delivered' or delivered_at is not null),
  check (status <> 'scheduled' or scheduled_for is not null)
);
create index notifications_user_feed_idx on public.notifications (user_id, status, created_at desc);
create index notifications_due_idx on public.notifications (scheduled_for) where status = 'scheduled';

alter table public.notifications enable row level security;
revoke all on table public.notifications from anon, authenticated;
grant select on table public.notifications to authenticated;
-- Users may only mark their notifications read/unread or dismiss them.
grant update (read_at, dismissed_at) on table public.notifications to authenticated;
create policy "Users can read their own notifications"
  on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Users can mark their own notifications"
  on public.notifications for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Server-side scheduler runs (no user access).
create table public.scheduler_runs (
  id bigint generated always as identity primary key,
  trigger_source text not null check (trigger_source in ('cron', 'github_actions', 'vercel_cron', 'manual', 'catch_up')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  users_processed integer not null default 0,
  notifications_created integer not null default 0,
  error text check (error is null or char_length(error) <= 500)
);
alter table public.scheduler_runs enable row level security;
revoke all on table public.scheduler_runs from anon, authenticated;

-- Signed-in users may see WHEN the background scheduler last ran (no counts,
-- no other users' data), so the Nudge Center can say if reminders are flowing.
create function public.scheduler_status()
returns table (last_run_at timestamptz, last_run_ok boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select r.started_at, r.error is null and r.finished_at is not null
  from public.scheduler_runs r
  where r.trigger_source <> 'catch_up'
  order by r.started_at desc
  limit 1
$$;
revoke all on function public.scheduler_status() from public, anon;
grant execute on function public.scheduler_status() to authenticated;

-- -----------------------------------------------------------------------------
-- Walrus Memory: new memory kinds for planning, nudges and wellbeing.
-- -----------------------------------------------------------------------------
alter table public.memory_records drop constraint memory_records_kind_check;
alter table public.memory_records add constraint memory_records_kind_check check (
  kind in (
    'recurring_expense', 'budgeting_style', 'overspending_category', 'savings_target',
    'savings_performance', 'goal_progress', 'income_pattern', 'subscription',
    'recommendation', 'recommendation_outcome', 'preference',
    'habit_pattern', 'routine_preference', 'scheduling_preference', 'notification_preference',
    'sleep_pattern', 'activity_routine', 'water_pattern', 'meal_routine', 'mood_pattern',
    'wellbeing_goal', 'review_reflection', 'correction'
  )
);
