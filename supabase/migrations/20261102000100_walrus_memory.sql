-- =============================================================================
-- AVEN Stage 3 — Migration 8: Walrus Memory references
--
-- Walrus Memory (MemWal, Mainnet) is the long-term memory store. The memory
-- TEXT lives in Walrus, encrypted by the MemWal relayer. Supabase keeps only
-- the bookkeeping AVEN needs to run the integration safely:
--   * a short, non-sensitive LABEL for the memory list
--     (e.g. "Recommendation outcome · Food"), never the memory text itself;
--   * a SHA-256 content hash so identical memories are not written twice;
--   * the MemWal job id, job status and Walrus blob id;
--   * a short-lived OUTBOX copy of the text (pending_text) while the write is
--     queued or in flight, so a failed or rate-limited write can be retried.
--     It is erased as soon as Walrus confirms the memory (or it is forgotten),
--     which a CHECK constraint enforces;
--   * whether the user has SUPPRESSED the memory ("forget"). The MemWal SDK
--     has no delete call, so a suppressed blob is excluded from every recall
--     AVEN performs, and the limitation is disclosed before consent.
--
-- Users may only READ their rows. Rows are written by the AVEN server after it
-- talks to the MemWal relayer, so job ids, blob ids and statuses cannot be
-- forged from the browser.
-- =============================================================================

create table public.memory_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  category text not null check (
    category in (
      'memory_financial', 'memory_shared_expenses', 'memory_wellbeing',
      'memory_planning', 'memory_interactions'
    )
  ),
  kind text not null check (
    kind in (
      'recurring_expense', 'budgeting_style', 'overspending_category', 'savings_target',
      'savings_performance', 'goal_progress', 'income_pattern', 'subscription',
      'recommendation', 'recommendation_outcome', 'preference'
    )
  ),
  label text not null check (char_length(btrim(label)) between 1 and 160),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  source_refs jsonb not null default '[]'::jsonb check (jsonb_typeof(source_refs) = 'array'),
  supersedes uuid references public.memory_records (id) on delete set null,
  status text not null default 'queued' check (
    status in ('queued', 'submitted', 'stored', 'failed', 'suppressed')
  ),
  job_id text check (job_id is null or char_length(job_id) <= 200),
  job_status text check (
    job_status is null
    or job_status in ('pending', 'running', 'uploaded', 'done', 'failed', 'not_found')
  ),
  blob_id text check (blob_id is null or char_length(blob_id) <= 200),
  pending_text text check (pending_text is null or char_length(pending_text) <= 4000),
  attempts integer not null default 0 check (attempts between 0 and 100),
  last_error text check (last_error is null or char_length(last_error) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz,
  stored_at timestamptz,
  suppressed_at timestamptz,
  constraint memory_records_stored_has_blob check (status <> 'stored' or blob_id is not null),
  constraint memory_records_outbox_cleared check (
    status not in ('stored', 'suppressed') or pending_text is null
  ),
  constraint memory_records_suppressed_at check (
    (status = 'suppressed') = (suppressed_at is not null)
  )
);

-- One row per distinct memory text per user: re-deriving the same fact never
-- creates a second Walrus write.
create unique index memory_records_user_hash_uniq on public.memory_records (user_id, content_hash);
create index memory_records_user_status_idx on public.memory_records (user_id, status);
create index memory_records_user_kind_idx on public.memory_records (user_id, kind, created_at desc);
create index memory_records_blob_idx on public.memory_records (user_id, blob_id) where blob_id is not null;

create trigger memory_records_set_updated_at
  before update on public.memory_records
  for each row execute function private.set_updated_at();

-- A suppressed memory can never be revived, and ownership never changes.
create or replace function private.guard_memory_record_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.user_id <> old.user_id or new.content_hash <> old.content_hash then
    raise exception 'Memory ownership and content cannot change' using errcode = '42501';
  end if;
  if old.status = 'suppressed' and new.status <> 'suppressed' then
    raise exception 'A forgotten memory cannot be restored' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger memory_records_guard_update
  before update on public.memory_records
  for each row execute function private.guard_memory_record_update();

alter table public.memory_records enable row level security;
revoke all on table public.memory_records from anon, authenticated;
grant select on table public.memory_records to authenticated;
create policy "Users can read their own memory records"
  on public.memory_records for select to authenticated
  using (user_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- Make the financial memory category available, with a new policy version.
-- The consent screen shows the Walrus disclosures for this version, including
-- that memories cannot be deleted from Walrus through the MemWal SDK.
-- Other memory categories stay locked: their features do not exist yet.
-- -----------------------------------------------------------------------------
update public.consent_categories
  set is_available = true, policy_version = '2026-11-02'
  where category = 'memory_financial';

-- Revoking memory consent is recorded in the audit log by set_consent(). The
-- app stops writing and recalling immediately; existing Walrus memories are
-- only used again if consent is granted again.
