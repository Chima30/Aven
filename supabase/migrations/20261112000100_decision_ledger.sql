-- =============================================================================
-- AVEN — Migration 20: Decision ledger (Decision Replay)
--
-- Additive only. Nothing existing is renamed or removed.
--
-- 1. public.decision_events: an append-only, trigger-written ledger of what
--    happened to each recommendation, with stable ids:
--      recommended  → the engine stored a recommendation
--      decided      → the user accepted, declined or changed it
--      remembered   → the decision was saved to Walrus Memory (memory_records id)
--      influenced   → a LATER recommendation was changed by this decision
--      forgotten    → the decision's Walrus memory was forgotten by the user
--      excluded     → the user told AVEN not to learn from this decision
--    Users can read their own events; nobody can insert, edit or delete them
--    through the API (only these SECURITY DEFINER triggers write them).
--
-- 2. recommendations.revision: a recommendation may be revised ONCE in the
--    same month (revision 2, dedupe key suffix ":r2") when the numbers change
--    materially after the user answered. Prevents repetition while allowing
--    AVEN to adapt within the month.
--
-- 3. recommendations.learning_excluded_at + exclude_decision_from_learning():
--    the user can stop AVEN learning from one decision.
--
-- 4. user_preferences.learn_from_decisions: whether AVEN adapts from the
--    user's own answered recommendations stored in AVEN (independent of
--    Walrus Memory, which stays governed by memory consent and pause).
-- =============================================================================

alter table public.recommendations
  add column revision smallint not null default 1 check (revision between 1 and 2),
  add column learning_excluded_at timestamptz;

grant insert (revision) on table public.recommendations to authenticated;

alter table public.user_preferences
  add column learn_from_decisions boolean not null default true;

grant update (learn_from_decisions) on table public.user_preferences to authenticated;

create table public.decision_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  recommendation_id uuid not null references public.recommendations (id) on delete cascade,
  event_type text not null check (
    event_type in ('recommended', 'decided', 'remembered', 'influenced', 'forgotten', 'excluded')
  ),
  -- For "influenced": the EARLIER recommendation whose decision changed this one.
  related_recommendation_id uuid references public.recommendations (id) on delete cascade,
  memory_record_id uuid references public.memory_records (id) on delete set null,
  detail jsonb not null default '{}'::jsonb check (
    jsonb_typeof(detail) = 'object' and pg_column_size(detail) <= 4096
  ),
  created_at timestamptz not null default now()
);

create index decision_events_user_rec_idx
  on public.decision_events (user_id, recommendation_id, created_at);
create index decision_events_related_idx
  on public.decision_events (related_recommendation_id)
  where related_recommendation_id is not null;

alter table public.decision_events enable row level security;
revoke all on table public.decision_events from anon, authenticated;
grant select on table public.decision_events to authenticated;
create policy "Users can read their own decision events"
  on public.decision_events for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------- writers

create or replace function private.decision_events_on_recommendation_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry jsonb;
  v_related uuid;
  v_memory uuid;
begin
  insert into public.decision_events (user_id, recommendation_id, event_type, detail)
  values (
    new.user_id, new.id, 'recommended',
    jsonb_build_object(
      'kind', new.kind,
      'period', new.period,
      'revision', new.revision,
      'suggested_minor', new.suggested_minor,
      'currency_code', new.currency_code
    )
  );

  -- Each memory_influence entry that names an earlier decision becomes an
  -- "influenced" event — but only if that decision is the user's own and was
  -- actually answered. Entries that only cite a Walrus blob are linked through
  -- memory_records → recommendations.outcome_memory_id.
  for v_entry in select * from jsonb_array_elements(new.memory_influence) loop
    v_related := null;
    v_memory := null;
    if (v_entry ->> 'recommendation_id') ~* '^[0-9a-f-]{36}$' then
      select r.id into v_related
        from public.recommendations r
        where r.id = (v_entry ->> 'recommendation_id')::uuid
          and r.user_id = new.user_id
          and r.status <> 'open'
          and r.id <> new.id;
    end if;
    if v_entry ->> 'blob_id' is not null then
      select m.id into v_memory
        from public.memory_records m
        where m.user_id = new.user_id and m.blob_id = v_entry ->> 'blob_id'
        limit 1;
      if v_related is null and v_memory is not null then
        select r.id into v_related
          from public.recommendations r
          where r.user_id = new.user_id and r.outcome_memory_id = v_memory and r.id <> new.id
          limit 1;
      end if;
    end if;
    if v_related is not null or v_memory is not null then
      insert into public.decision_events (
        user_id, recommendation_id, event_type, related_recommendation_id, memory_record_id, detail
      ) values (
        new.user_id, new.id, 'influenced', v_related, v_memory,
        jsonb_build_object(
          'source', coalesce(v_entry ->> 'source', 'walrus'),
          'effect', left(coalesce(v_entry ->> 'effect', ''), 300),
          'blob_id', v_entry ->> 'blob_id'
        )
      );
    end if;
  end loop;
  return new;
end;
$$;

create trigger recommendations_decision_events_insert
  after insert on public.recommendations
  for each row execute function private.decision_events_on_recommendation_insert();

create or replace function private.decision_events_on_recommendation_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'open' and new.status <> 'open' then
    insert into public.decision_events (user_id, recommendation_id, event_type, detail)
    values (
      new.user_id, new.id, 'decided',
      jsonb_build_object('action', new.status, 'response_minor', new.response_minor)
    );
  end if;
  if new.outcome_memory_id is not null
     and new.outcome_memory_id is distinct from old.outcome_memory_id then
    insert into public.decision_events (
      user_id, recommendation_id, event_type, memory_record_id, detail
    ) values (new.user_id, new.id, 'remembered', new.outcome_memory_id, '{}'::jsonb);
  end if;
  if new.learning_excluded_at is not null and old.learning_excluded_at is null then
    insert into public.decision_events (user_id, recommendation_id, event_type, detail)
    values (new.user_id, new.id, 'excluded', '{}'::jsonb);
  end if;
  return new;
end;
$$;

create trigger recommendations_decision_events_update
  after update on public.recommendations
  for each row execute function private.decision_events_on_recommendation_update();

create or replace function private.decision_events_on_memory_forgotten()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'suppressed' and old.status <> 'suppressed' then
    insert into public.decision_events (
      user_id, recommendation_id, event_type, memory_record_id, detail
    )
    select r.user_id, r.id, 'forgotten', new.id, '{}'::jsonb
      from public.recommendations r
      where r.user_id = new.user_id and r.outcome_memory_id = new.id;
  end if;
  return new;
end;
$$;

create trigger memory_records_decision_events_forgotten
  after update of status on public.memory_records
  for each row execute function private.decision_events_on_memory_forgotten();

revoke all on function private.decision_events_on_recommendation_insert() from public;
revoke all on function private.decision_events_on_recommendation_update() from public;
revoke all on function private.decision_events_on_memory_forgotten() from public;

-- ---------------------------------------------------------------- user action

/** Stop AVEN learning from one of the user's answered recommendations (irreversible). */
create or replace function public.exclude_decision_from_learning(p_id uuid)
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
  update public.recommendations r
    set learning_excluded_at = now()
    where r.id = p_id and r.user_id = v_user and r.status <> 'open'
      and r.learning_excluded_at is null;
  if not found then
    if not exists (
      select 1 from public.recommendations r where r.id = p_id and r.user_id = v_user
    ) then
      raise exception 'Recommendation not found' using errcode = '42501';
    end if;
  end if;
  perform private.write_audit(v_user, 'intelligence.decision_excluded', '{}'::jsonb);
end;
$$;

revoke all on function public.exclude_decision_from_learning(uuid) from public, anon;
grant execute on function public.exclude_decision_from_learning(uuid) to authenticated;
