-- =============================================================================
-- AVEN Stage 1 — Migration 1: Foundation
-- Profiles, reference currencies, user preferences, new-user bootstrap.
--
-- Access model:
--   * Every user-owned table has Row Level Security (RLS) enabled.
--   * Table privileges are granted explicitly; the anonymous role gets nothing.
--   * Helper functions that must bypass RLS live in the "private" schema,
--     which is NOT exposed through the Supabase Data API.
-- =============================================================================

create schema if not exists private;
revoke all on schema private from public;

-- -----------------------------------------------------------------------------
-- Shared trigger: keep updated_at current
-- -----------------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Reference data: currencies (ISO 4217) with their minor-unit precision.
-- Readable by everyone; writable only through migrations.
-- Must stay in sync with src/lib/money/currencies.ts (a database test checks this).
-- -----------------------------------------------------------------------------
create table public.currencies (
  code text primary key check (code ~ '^[A-Z]{3}$'),
  minor_units smallint not null check (minor_units between 0 and 4),
  name text not null check (char_length(name) between 1 and 80)
);

alter table public.currencies enable row level security;
revoke all on table public.currencies from anon, authenticated;
grant select on table public.currencies to anon, authenticated;
create policy "Currencies are readable by everyone"
  on public.currencies for select
  to anon, authenticated
  using (true);

insert into public.currencies (code, minor_units, name) values
  ('AED', 2, 'UAE Dirham'),
  ('ARS', 2, 'Argentine Peso'),
  ('AUD', 2, 'Australian Dollar'),
  ('BDT', 2, 'Bangladeshi Taka'),
  ('BHD', 3, 'Bahraini Dinar'),
  ('BRL', 2, 'Brazilian Real'),
  ('BWP', 2, 'Botswana Pula'),
  ('CAD', 2, 'Canadian Dollar'),
  ('CHF', 2, 'Swiss Franc'),
  ('CLP', 0, 'Chilean Peso'),
  ('CNY', 2, 'Chinese Yuan'),
  ('COP', 2, 'Colombian Peso'),
  ('CZK', 2, 'Czech Koruna'),
  ('DKK', 2, 'Danish Krone'),
  ('EGP', 2, 'Egyptian Pound'),
  ('ETB', 2, 'Ethiopian Birr'),
  ('EUR', 2, 'Euro'),
  ('GBP', 2, 'British Pound'),
  ('GHS', 2, 'Ghanaian Cedi'),
  ('HKD', 2, 'Hong Kong Dollar'),
  ('HUF', 2, 'Hungarian Forint'),
  ('IDR', 2, 'Indonesian Rupiah'),
  ('ILS', 2, 'Israeli New Shekel'),
  ('INR', 2, 'Indian Rupee'),
  ('IQD', 3, 'Iraqi Dinar'),
  ('ISK', 0, 'Icelandic Króna'),
  ('JOD', 3, 'Jordanian Dinar'),
  ('JPY', 0, 'Japanese Yen'),
  ('KES', 2, 'Kenyan Shilling'),
  ('KRW', 0, 'South Korean Won'),
  ('KWD', 3, 'Kuwaiti Dinar'),
  ('LYD', 3, 'Libyan Dinar'),
  ('MAD', 2, 'Moroccan Dirham'),
  ('MXN', 2, 'Mexican Peso'),
  ('MYR', 2, 'Malaysian Ringgit'),
  ('NGN', 2, 'Nigerian Naira'),
  ('NOK', 2, 'Norwegian Krone'),
  ('NZD', 2, 'New Zealand Dollar'),
  ('OMR', 3, 'Omani Rial'),
  ('PEN', 2, 'Peruvian Sol'),
  ('PHP', 2, 'Philippine Peso'),
  ('PKR', 2, 'Pakistani Rupee'),
  ('PLN', 2, 'Polish Złoty'),
  ('QAR', 2, 'Qatari Riyal'),
  ('RON', 2, 'Romanian Leu'),
  ('RWF', 0, 'Rwandan Franc'),
  ('SAR', 2, 'Saudi Riyal'),
  ('SEK', 2, 'Swedish Krona'),
  ('SGD', 2, 'Singapore Dollar'),
  ('THB', 2, 'Thai Baht'),
  ('TND', 3, 'Tunisian Dinar'),
  ('TRY', 2, 'Turkish Lira'),
  ('TWD', 2, 'New Taiwan Dollar'),
  ('TZS', 2, 'Tanzanian Shilling'),
  ('UAH', 2, 'Ukrainian Hryvnia'),
  ('UGX', 0, 'Ugandan Shilling'),
  ('USD', 2, 'US Dollar'),
  ('VND', 0, 'Vietnamese Đồng'),
  ('XAF', 0, 'Central African CFA Franc'),
  ('XOF', 0, 'West African CFA Franc'),
  ('ZAR', 2, 'South African Rand'),
  ('ZMW', 2, 'Zambian Kwacha');

-- -----------------------------------------------------------------------------
-- Profiles: one row per Supabase Auth user. Created automatically on sign-up.
-- Deleting the auth user deletes the profile and everything that hangs off it.
-- -----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (
    display_name is null or char_length(btrim(display_name)) between 1 and 80
  ),
  country_code text check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

alter table public.profiles enable row level security;
revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
-- Column-level grant: users can only change these two columns.
grant update (display_name, country_code) on table public.profiles to authenticated;

create policy "Users can read their own profile"
  on public.profiles for select
  to authenticated
  using (id = (select auth.uid()));

create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- User preferences: regional settings, appearance, AI switch, memory pause.
-- -----------------------------------------------------------------------------
create table public.user_preferences (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  currency_code text not null default 'USD' references public.currencies (code),
  locale text not null default 'en-US' check (
    char_length(locale) between 2 and 35 and locale ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$'
  ),
  time_zone text not null default 'UTC' check (char_length(time_zone) between 1 and 64),
  week_start smallint not null default 1 check (week_start between 0 and 6),
  date_format text not null default 'locale' check (date_format in ('locale', 'dmy', 'mdy', 'ymd')),
  number_format text not null default 'locale' check (
    number_format in ('locale', 'comma_dot', 'dot_comma', 'space_comma')
  ),
  measurement_system text not null default 'metric' check (
    measurement_system in ('metric', 'imperial')
  ),
  theme text not null default 'system' check (theme in ('system', 'light', 'dark')),
  -- Master AI switch. When false, no user data may be sent to an AI provider.
  ai_enabled boolean not null default false,
  -- Master memory pause. When true, no new memories may be created (Stage 6+).
  memory_paused boolean not null default false,
  updated_at timestamptz not null default now()
);

-- Reject time zones PostgreSQL does not recognise (e.g. "Mars/Olympus").
create or replace function private.validate_time_zone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.time_zone) then
    raise exception 'Unknown time zone: %', new.time_zone using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger user_preferences_validate_time_zone
  before insert or update of time_zone on public.user_preferences
  for each row execute function private.validate_time_zone();

create trigger user_preferences_set_updated_at
  before update on public.user_preferences
  for each row execute function private.set_updated_at();

alter table public.user_preferences enable row level security;
revoke all on table public.user_preferences from anon, authenticated;
grant select on table public.user_preferences to authenticated;
grant update (
  currency_code, locale, time_zone, week_start, date_format, number_format,
  measurement_system, theme, ai_enabled, memory_paused
) on table public.user_preferences to authenticated;

create policy "Users can read their own preferences"
  on public.user_preferences for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "Users can update their own preferences"
  on public.user_preferences for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
