-- =============================================================================
-- AVEN Stage 1 — Migration 3: AI usage limits, rate limiting, offline sync
-- metadata, data export log, anonymised account deletion log.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- AI usage limits (enforced server-side from Stage 6; created now so limits
-- exist before any AI call is ever made).
-- Users can read their limits and usage. Only the server (service role) records usage.
-- -----------------------------------------------------------------------------
create table public.ai_usage_limits (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  daily_request_limit integer not null default 25 check (daily_request_limit between 0 and 1000),
  monthly_token_limit integer not null default 250000 check (monthly_token_limit between 0 and 50000000),
  updated_at timestamptz not null default now()
);

alter table public.ai_usage_limits enable row level security;
revoke all on table public.ai_usage_limits from anon, authenticated;
grant select on table public.ai_usage_limits to authenticated;
create policy "Users can read their own AI limits"
  on public.ai_usage_limits for select
  to authenticated
  using (user_id = (select auth.uid()));

create table public.ai_usage_daily (
  user_id uuid not null references public.profiles (id) on delete cascade,
  usage_date date not null,
  request_count integer not null default 0 check (request_count >= 0),
  input_tokens bigint not null default 0 check (input_tokens >= 0),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  primary key (user_id, usage_date)
);

alter table public.ai_usage_daily enable row level security;
revoke all on table public.ai_usage_daily from anon, authenticated;
grant select on table public.ai_usage_daily to authenticated;
create policy "Users can read their own AI usage"
  on public.ai_usage_daily for select
  to authenticated
  using (user_id = (select auth.uid()));

-- Quota check for the signed-in user. Days and months are measured in UTC.
create or replace function public.ai_quota_status()
returns table (
  ai_enabled boolean,
  ai_consent boolean,
  requests_today integer,
  daily_request_limit integer,
  tokens_this_month bigint,
  monthly_token_limit integer,
  allowed boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  with me as (select auth.uid() as id),
  pref as (select p.ai_enabled from public.user_preferences p, me where p.user_id = me.id),
  consent as (
    select coalesce((select c.granted from public.consent_state c, me
      where c.user_id = me.id and c.category = 'ai_processing'), false) as granted
  ),
  lim as (select l.* from public.ai_usage_limits l, me where l.user_id = me.id),
  today as (
    select coalesce(sum(d.request_count), 0)::integer as n
    from public.ai_usage_daily d, me
    where d.user_id = me.id and d.usage_date = (now() at time zone 'utc')::date
  ),
  month as (
    select coalesce(sum(d.input_tokens + d.output_tokens), 0)::bigint as n
    from public.ai_usage_daily d, me
    where d.user_id = me.id
      and d.usage_date >= date_trunc('month', now() at time zone 'utc')::date
  )
  select
    coalesce(pref.ai_enabled, false),
    consent.granted,
    today.n,
    coalesce(lim.daily_request_limit, 0),
    month.n,
    coalesce(lim.monthly_token_limit, 0),
    coalesce(pref.ai_enabled, false)
      and consent.granted
      and today.n < coalesce(lim.daily_request_limit, 0)
      and month.n < coalesce(lim.monthly_token_limit, 0)
  from consent, today, month
  left join pref on true
  left join lim on true;
$$;
revoke all on function public.ai_quota_status() from public, anon;
grant execute on function public.ai_quota_status() to authenticated;

-- Server-only usage recorder (service role). Not callable by users.
create or replace function public.record_ai_usage(p_user_id uuid, p_input_tokens bigint, p_output_tokens bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_input_tokens < 0 or p_output_tokens < 0 then
    raise exception 'Token counts cannot be negative' using errcode = '22023';
  end if;
  insert into public.ai_usage_daily (user_id, usage_date, request_count, input_tokens, output_tokens)
  values (p_user_id, (now() at time zone 'utc')::date, 1, p_input_tokens, p_output_tokens)
  on conflict (user_id, usage_date) do update
    set request_count = public.ai_usage_daily.request_count + 1,
        input_tokens = public.ai_usage_daily.input_tokens + excluded.input_tokens,
        output_tokens = public.ai_usage_daily.output_tokens + excluded.output_tokens;
end;
$$;
revoke all on function public.record_ai_usage(uuid, bigint, bigint) from public, anon, authenticated;
grant execute on function public.record_ai_usage(uuid, bigint, bigint) to service_role;

-- -----------------------------------------------------------------------------
-- Rate limiting for sensitive actions (fixed window, stored in Postgres so it
-- works across Vercel serverless instances without another platform).
-- The table is invisible to users; only consume_rate_limit() touches it.
-- -----------------------------------------------------------------------------
create table public.rate_limit_buckets (
  bucket_key text not null,
  window_start timestamptz not null,
  hit_count integer not null default 0,
  primary key (bucket_key, window_start)
);

alter table public.rate_limit_buckets enable row level security;
revoke all on table public.rate_limit_buckets from anon, authenticated;
-- No policies: users cannot read or write this table directly.

create or replace function public.consume_rate_limit(p_action text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_key text;
  v_window timestamptz;
  v_count integer;
begin
  if v_user is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_action !~ '^[a-z_]{1,48}$' then
    raise exception 'Invalid action' using errcode = '22023';
  end if;
  if p_max not between 1 and 1000 or p_window_seconds not between 1 and 86400 then
    raise exception 'Invalid rate limit parameters' using errcode = '22023';
  end if;

  v_key := v_user::text || ':' || p_action || ':' || p_window_seconds::text;
  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into public.rate_limit_buckets as b (bucket_key, window_start, hit_count)
  values (v_key, v_window, 1)
  on conflict (bucket_key, window_start) do update set hit_count = b.hit_count + 1
  returning hit_count into v_count;

  -- Housekeeping: drop this user's expired windows.
  delete from public.rate_limit_buckets
  where bucket_key = v_key and window_start < v_window;

  return v_count <= p_max;
end;
$$;
revoke all on function public.consume_rate_limit(text, integer, integer) from public, anon;
grant execute on function public.consume_rate_limit(text, integer, integer) to authenticated;

-- -----------------------------------------------------------------------------
-- Offline sync metadata (used by the Stage 2 sync engine).
--   user_devices  : devices that have synced offline data
--   sync_receipts : one row per client mutation id → makes retries idempotent
-- -----------------------------------------------------------------------------
create table public.user_devices (
  id uuid primary key,  -- generated on the device and kept in IndexedDB
  user_id uuid not null references public.profiles (id) on delete cascade,
  label text check (label is null or char_length(label) between 1 and 60),
  platform text check (platform is null or char_length(platform) between 1 and 40),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_sync_at timestamptz
);

create index user_devices_user_idx on public.user_devices (user_id);

alter table public.user_devices enable row level security;
revoke all on table public.user_devices from anon, authenticated;
grant select, insert, delete on table public.user_devices to authenticated;
grant update (label, last_seen_at, last_sync_at) on table public.user_devices to authenticated;

create policy "Users can read their own devices"
  on public.user_devices for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Users can register their own devices"
  on public.user_devices for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "Users can update their own devices"
  on public.user_devices for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "Users can remove their own devices"
  on public.user_devices for delete to authenticated
  using (user_id = (select auth.uid()));

create table public.sync_receipts (
  user_id uuid not null references public.profiles (id) on delete cascade,
  client_mutation_id uuid not null,
  device_id uuid references public.user_devices (id) on delete set null,
  entity text not null check (entity ~ '^[a-z_]{1,48}$'),
  record_id uuid not null,
  operation text not null check (operation in ('create', 'update', 'delete')),
  result text not null check (result in ('applied', 'conflict', 'rejected')),
  server_version bigint,
  received_at timestamptz not null default now(),
  primary key (user_id, client_mutation_id)
);

alter table public.sync_receipts enable row level security;
revoke all on table public.sync_receipts from anon, authenticated;
grant select, insert on table public.sync_receipts to authenticated;

create policy "Users can read their own sync receipts"
  on public.sync_receipts for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Users can record their own sync receipts"
  on public.sync_receipts for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (
      device_id is null
      or exists (
        select 1 from public.user_devices d
        where d.id = device_id and d.user_id = (select auth.uid())
      )
    )
  );

-- -----------------------------------------------------------------------------
-- Data export log: a record that an export happened (not the export itself).
-- -----------------------------------------------------------------------------
create table public.data_export_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  format text not null check (format in ('json')),
  byte_size integer not null check (byte_size >= 0),
  created_at timestamptz not null default now()
);

alter table public.data_export_log enable row level security;
revoke all on table public.data_export_log from anon, authenticated;
grant select on table public.data_export_log to authenticated;
create policy "Users can read their own export log"
  on public.data_export_log for select to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.record_data_export(p_format text, p_byte_size integer)
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
  insert into public.data_export_log (user_id, format, byte_size) values (v_user, p_format, p_byte_size);
  perform private.write_audit(v_user, 'data.exported',
    jsonb_build_object('format', p_format, 'byte_size', p_byte_size));
end;
$$;
revoke all on function public.record_data_export(text, integer) from public, anon;
grant execute on function public.record_data_export(text, integer) to authenticated;

-- -----------------------------------------------------------------------------
-- Account deletion log. Deliberately contains NO personal data: only a SHA-256
-- hash of the user id, timestamps, outcome and the status of external cleanup.
-- It survives the deletion so operators can prove a deletion was carried out.
-- Service role only (no policies, no grants to users).
-- -----------------------------------------------------------------------------
create table public.account_deletion_log (
  id uuid primary key default gen_random_uuid(),
  subject_hash text not null check (subject_hash ~ '^[a-f0-9]{64}$'),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  outcome text not null default 'started' check (outcome in ('started', 'completed', 'failed')),
  -- e.g. {"walrus": "not_applicable"} — external stores report their own status.
  external_cleanup jsonb not null default '{}'::jsonb check (jsonb_typeof(external_cleanup) = 'object')
);

alter table public.account_deletion_log enable row level security;
revoke all on table public.account_deletion_log from anon, authenticated;
