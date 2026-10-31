-- =============================================================================
-- AVEN Stage 1 — Migration 4: New-user bootstrap
-- When Supabase Auth creates a user, create their profile and default settings.
-- No financial, wellbeing or sample data is created — new users start empty.
-- =============================================================================

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), '');
begin
  -- Never let a bad display name block sign-up; store nothing instead.
  if v_name is not null and char_length(v_name) > 80 then
    v_name := null;
  end if;

  insert into public.profiles (id, display_name) values (new.id, v_name);
  insert into public.user_preferences (user_id) values (new.id);
  insert into public.notification_preferences (user_id) values (new.id);
  insert into public.ai_usage_limits (user_id) values (new.id);

  insert into public.notification_category_preferences (user_id, category, frequency) values
    (new.id, 'subscriptions',    'daily_digest'),
    (new.id, 'shared_expenses',  'daily_digest'),
    (new.id, 'budgets',          'daily_digest'),
    (new.id, 'savings',          'weekly_digest'),
    (new.id, 'routines',         'daily_digest'),
    (new.id, 'wellbeing',        'weekly_digest'),
    (new.id, 'planning',         'daily_digest'),
    (new.id, 'account_security', 'immediate');

  -- Every consent category starts explicitly NOT granted.
  insert into public.consent_state (user_id, category, granted, policy_version)
  select new.id, c.category, false, c.policy_version from public.consent_categories c;

  perform private.write_audit(new.id, 'account.created', '{}'::jsonb);
  return new;
end;
$$;

revoke all on function private.handle_new_user() from public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- -----------------------------------------------------------------------------
-- Account deletion clean-up for data that is not linked by a foreign key.
-- (Rate-limit buckets are keyed by text so they can be pruned cheaply.)
-- -----------------------------------------------------------------------------
create or replace function private.cleanup_deleted_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.rate_limit_buckets where bucket_key like old.id::text || ':%';
  return old;
end;
$$;

revoke all on function private.cleanup_deleted_profile() from public;

create trigger on_profile_deleted
  after delete on public.profiles
  for each row execute function private.cleanup_deleted_profile();
