-- =============================================================================
-- AVEN Stage 1 — Migration 2: Audit log, consent, notification preferences
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Audit log: security-relevant events for the user's own review.
-- Users can READ their own entries. Nobody writes directly; entries are added
-- by database functions and triggers so they cannot be edited or deleted.
-- -----------------------------------------------------------------------------
create table public.audit_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  action text not null check (action ~ '^[a-z_]+\.[a-z_]+$' and char_length(action) <= 64),
  metadata jsonb not null default '{}'::jsonb check (
    jsonb_typeof(metadata) = 'object' and pg_column_size(metadata) <= 2048
  ),
  created_at timestamptz not null default now()
);

create index audit_log_user_created_idx on public.audit_log (user_id, created_at desc);

alter table public.audit_log enable row level security;
revoke all on table public.audit_log from anon, authenticated;
grant select on table public.audit_log to authenticated;

create policy "Users can read their own audit log"
  on public.audit_log for select
  to authenticated
  using (user_id = (select auth.uid()));

-- Internal writer (not callable through the API).
create or replace function private.write_audit(p_user_id uuid, p_action text, p_metadata jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_log (user_id, action, metadata)
  values (p_user_id, p_action, coalesce(p_metadata, '{}'::jsonb));
end;
$$;
revoke all on function private.write_audit(uuid, text, jsonb) from public;

-- Public, allow-listed event logger for events that happen outside the database
-- (sign-in, sign-out, password change). The user id always comes from the session.
create or replace function public.log_security_event(p_action text)
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
  if p_action not in (
    'auth.signed_in',
    'auth.signed_out',
    'auth.signed_out_everywhere',
    'auth.password_changed',
    'auth.password_reset_completed',
    'auth.email_confirmed'
  ) then
    raise exception 'Action not allowed: %', p_action using errcode = '22023';
  end if;
  perform private.write_audit(v_user, p_action, '{}'::jsonb);
end;
$$;
revoke all on function public.log_security_event(text) from public, anon;
grant execute on function public.log_security_event(text) to authenticated;

-- Log changes to privacy-relevant preferences automatically.
create or replace function private.audit_preference_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.ai_enabled is distinct from old.ai_enabled then
    perform private.write_audit(new.user_id, 'privacy.ai_preference_changed',
      jsonb_build_object('ai_enabled', new.ai_enabled));
  end if;
  if new.memory_paused is distinct from old.memory_paused then
    perform private.write_audit(new.user_id, 'privacy.memory_pause_changed',
      jsonb_build_object('memory_paused', new.memory_paused));
  end if;
  return new;
end;
$$;

create trigger user_preferences_audit
  after update on public.user_preferences
  for each row execute function private.audit_preference_changes();

-- -----------------------------------------------------------------------------
-- Consent
--   consent_categories : catalogue (which categories exist, which are available)
--   consent_records    : append-only history of every grant / withdrawal
--   consent_state      : current state per category, maintained by set_consent()
-- -----------------------------------------------------------------------------
create table public.consent_categories (
  category text primary key check (category ~ '^[a-z_]+$'),
  is_sensitive boolean not null,
  -- false = the feature is not built/verified yet; consent cannot be granted.
  is_available boolean not null default false,
  policy_version text not null check (char_length(policy_version) between 1 and 32)
);

alter table public.consent_categories enable row level security;
revoke all on table public.consent_categories from anon, authenticated;
grant select on table public.consent_categories to authenticated;
create policy "Consent catalogue is readable by signed-in users"
  on public.consent_categories for select
  to authenticated
  using (true);

insert into public.consent_categories (category, is_sensitive, is_available, policy_version) values
  ('ai_processing',          true,  true,  '2026-10-31'),
  ('wellbeing_data',         true,  true,  '2026-10-31'),
  -- Walrus Memory categories stay unavailable until Stage 6 has verified
  -- Walrus write, retrieval, access-revocation and deletion behaviour.
  ('memory_financial',       true,  false, '2026-10-31'),
  ('memory_shared_expenses', true,  false, '2026-10-31'),
  ('memory_wellbeing',       true,  false, '2026-10-31'),
  ('memory_planning',        false, false, '2026-10-31'),
  ('memory_interactions',    false, false, '2026-10-31');

create table public.consent_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  category text not null references public.consent_categories (category),
  granted boolean not null,
  policy_version text not null,
  source text not null check (source in ('settings', 'onboarding', 'feature_prompt')),
  created_at timestamptz not null default now()
);

create index consent_records_user_idx on public.consent_records (user_id, created_at desc);

alter table public.consent_records enable row level security;
revoke all on table public.consent_records from anon, authenticated;
grant select on table public.consent_records to authenticated;
create policy "Users can read their own consent history"
  on public.consent_records for select
  to authenticated
  using (user_id = (select auth.uid()));

create table public.consent_state (
  user_id uuid not null references public.profiles (id) on delete cascade,
  category text not null references public.consent_categories (category),
  granted boolean not null,
  policy_version text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, category)
);

alter table public.consent_state enable row level security;
revoke all on table public.consent_state from anon, authenticated;
grant select on table public.consent_state to authenticated;
create policy "Users can read their own consent state"
  on public.consent_state for select
  to authenticated
  using (user_id = (select auth.uid()));

-- The only way to change consent. Records history, updates state, writes audit.
create or replace function public.set_consent(p_category text, p_granted boolean, p_source text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_cat public.consent_categories%rowtype;
begin
  if v_user is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_granted is null then
    raise exception 'granted must be true or false' using errcode = '22023';
  end if;
  if p_source not in ('settings', 'onboarding', 'feature_prompt') then
    raise exception 'Invalid consent source' using errcode = '22023';
  end if;

  select * into v_cat from public.consent_categories where category = p_category;
  if not found then
    raise exception 'Unknown consent category: %', p_category using errcode = '22023';
  end if;
  -- Withdrawing is always allowed. Granting requires the feature to be available.
  if p_granted and not v_cat.is_available then
    raise exception 'Consent category % is not available yet', p_category using errcode = '55000';
  end if;

  insert into public.consent_records (user_id, category, granted, policy_version, source)
  values (v_user, p_category, p_granted, v_cat.policy_version, p_source);

  insert into public.consent_state (user_id, category, granted, policy_version, updated_at)
  values (v_user, p_category, p_granted, v_cat.policy_version, now())
  on conflict (user_id, category) do update
    set granted = excluded.granted,
        policy_version = excluded.policy_version,
        updated_at = excluded.updated_at;

  perform private.write_audit(v_user,
    case when p_granted then 'consent.granted' else 'consent.withdrawn' end,
    jsonb_build_object('category', p_category, 'policy_version', v_cat.policy_version));
end;
$$;
revoke all on function public.set_consent(text, boolean, text) from public, anon;
grant execute on function public.set_consent(text, boolean, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Notification preferences (Nudge Center foundation).
-- Deterministic rules in src/lib/nudges enforce these; AI can never override them.
-- -----------------------------------------------------------------------------
create table public.notification_preferences (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  in_app_enabled boolean not null default true,
  -- Email and push delivery are not built yet; the UI keeps them disabled.
  email_enabled boolean not null default false,
  push_enabled boolean not null default false,
  daily_digest_enabled boolean not null default true,
  daily_digest_time time not null default '08:00',
  weekly_digest_enabled boolean not null default true,
  weekly_digest_day smallint not null default 0 check (weekly_digest_day between 0 and 6),
  quiet_hours_enabled boolean not null default true,
  quiet_hours_start time not null default '22:00',
  quiet_hours_end time not null default '07:00',
  pause_nonessential boolean not null default false,
  max_nudges_per_day smallint not null default 3 check (max_nudges_per_day between 0 and 20),
  updated_at timestamptz not null default now(),
  check (quiet_hours_start <> quiet_hours_end)
);

create trigger notification_preferences_set_updated_at
  before update on public.notification_preferences
  for each row execute function private.set_updated_at();

alter table public.notification_preferences enable row level security;
revoke all on table public.notification_preferences from anon, authenticated;
grant select on table public.notification_preferences to authenticated;
grant update (
  in_app_enabled, daily_digest_enabled, daily_digest_time, weekly_digest_enabled,
  weekly_digest_day, quiet_hours_enabled, quiet_hours_start, quiet_hours_end,
  pause_nonessential, max_nudges_per_day
) on table public.notification_preferences to authenticated;

create policy "Users can read their own notification preferences"
  on public.notification_preferences for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "Users can update their own notification preferences"
  on public.notification_preferences for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create table public.notification_category_preferences (
  user_id uuid not null references public.profiles (id) on delete cascade,
  category text not null check (category in (
    'subscriptions', 'shared_expenses', 'budgets', 'savings',
    'routines', 'wellbeing', 'planning', 'account_security'
  )),
  frequency text not null check (frequency in ('immediate', 'daily_digest', 'weekly_digest', 'off')),
  updated_at timestamptz not null default now(),
  primary key (user_id, category),
  -- Account security notices are essential and cannot be switched off.
  check (category <> 'account_security' or frequency <> 'off')
);

create trigger notification_category_preferences_set_updated_at
  before update on public.notification_category_preferences
  for each row execute function private.set_updated_at();

alter table public.notification_category_preferences enable row level security;
revoke all on table public.notification_category_preferences from anon, authenticated;
grant select on table public.notification_category_preferences to authenticated;
grant update (frequency) on table public.notification_category_preferences to authenticated;

create policy "Users can read their own notification categories"
  on public.notification_category_preferences for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "Users can update their own notification categories"
  on public.notification_category_preferences for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
