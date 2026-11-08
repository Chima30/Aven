-- =============================================================================
-- Stage 10 · Rate limits: fixed list of actions, limits set by the database
-- =============================================================================

-- consume_rate_limit() used to accept any action name and any limit from the
-- caller. Because signed-in users can call it directly, one script could create
-- endless rows (one per made-up name) and bloat the table for everyone.
--
-- Now only AVEN's own actions are accepted, and each one's limit and window
-- come from this function, not from the request. The p_max/p_window_seconds
-- arguments are kept so existing app code keeps working, but are ignored.
-- (Keep this list in step with RATE_LIMITS in src/lib/security/rate-limit.ts;
-- a database test checks they match.)
create or replace function public.consume_rate_limit(p_action text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_max integer;
  v_window_seconds integer;
  v_key text;
  v_window timestamptz;
  v_count integer;
begin
  if v_user is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select l.max_hits, l.window_seconds into v_max, v_window_seconds
  from (values
    ('delete_account', 5, 3600),
    ('change_password', 5, 3600),
    ('export_data', 10, 3600),
    ('sign_out_everywhere', 10, 3600),
    ('sync', 120, 60),
    ('finance_write', 120, 60),
    ('memory_write', 60, 3600),
    ('memory_read', 60, 600),
    ('chain_read', 60, 600),
    ('chain_import', 30, 3600),
    ('wallet_change', 20, 3600),
    ('recommendations', 30, 3600),
    ('life_write', 120, 60),
    ('notification_update', 120, 60),
    ('email_test', 3, 3600)
  ) as l(action, max_hits, window_seconds)
  where l.action = p_action;

  if v_max is null then
    raise exception 'Unknown rate-limited action' using errcode = '22023';
  end if;

  v_key := v_user::text || ':' || p_action || ':' || v_window_seconds::text;
  v_window := to_timestamp(floor(extract(epoch from now()) / v_window_seconds) * v_window_seconds);

  insert into public.rate_limit_buckets as b (bucket_key, window_start, hit_count)
  values (v_key, v_window, 1)
  on conflict (bucket_key, window_start) do update set hit_count = b.hit_count + 1
  returning hit_count into v_count;

  -- Housekeeping: drop this user's expired windows.
  delete from public.rate_limit_buckets
  where bucket_key = v_key and window_start < v_window;

  return v_count <= v_max;
end;
$$;
revoke all on function public.consume_rate_limit(text, integer, integer) from public, anon;
grant execute on function public.consume_rate_limit(text, integer, integer) to authenticated;

-- Remove rows left behind by names that are no longer accepted.
delete from public.rate_limit_buckets
where split_part(bucket_key, ':', 2) not in (
  'delete_account', 'change_password', 'export_data', 'sign_out_everywhere', 'sync',
  'finance_write', 'memory_write', 'memory_read', 'chain_read', 'chain_import',
  'wallet_change', 'recommendations', 'life_write', 'notification_update', 'email_test'
);
