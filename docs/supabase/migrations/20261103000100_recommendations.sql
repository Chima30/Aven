-- =============================================================================
-- AVEN Stage 4 — Migration 10: Recommendations and the user's decisions
--
-- Recommendations are produced by AVEN's deterministic intelligence engine
-- (src/lib/intelligence) from the user's own records plus memories recalled
-- from Walrus. This table is the INBOX: what was suggested this period and
-- how the user responded. It is not long-term memory — the decision is also
-- written to Walrus Memory (when the user has allowed memory), and the next
-- recommendations are shaped by what is RECALLED from Walrus.
--
-- Users may read their recommendations and create new open ones for
-- themselves (the engine runs with the user's session). Responses go through
-- respond_to_recommendation(), so a decision is recorded exactly once.
-- =============================================================================

create table public.recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (
    kind in (
      'reduce_category_spend', 'set_category_budget', 'increase_savings',
      'review_subscription', 'goal_contribution'
    )
  ),
  -- kind + subject + period, e.g. "reduce_category_spend:<category id>:2026-11"
  dedupe_key text not null check (char_length(dedupe_key) between 3 and 200),
  period text not null check (period ~ '^\d{4}-\d{2}$'),
  title text not null check (char_length(btrim(title)) between 1 and 160),
  explanation text not null check (char_length(explanation) between 1 and 2000),
  currency_code text not null references public.currencies (code),
  suggested_minor bigint check (
    suggested_minor is null or (suggested_minor >= 0 and suggested_minor <= private.max_amount_minor())
  ),
  category_id uuid references public.transaction_categories (id) on delete set null,
  goal_id uuid references public.savings_goals (id) on delete set null,
  -- The numbers the engine used (deterministic, re-checkable).
  evidence jsonb not null default '{}'::jsonb check (
    jsonb_typeof(evidence) = 'object' and pg_column_size(evidence) <= 8192
  ),
  -- Which recalled Walrus memories changed this recommendation, and how.
  memory_influence jsonb not null default '[]'::jsonb check (
    jsonb_typeof(memory_influence) = 'array' and pg_column_size(memory_influence) <= 8192
  ),
  status text not null default 'open' check (status in ('open', 'accepted', 'rejected', 'modified')),
  response_minor bigint check (
    response_minor is null or (response_minor >= 0 and response_minor <= private.max_amount_minor())
  ),
  response_note text check (response_note is null or char_length(response_note) <= 300),
  responded_at timestamptz,
  outcome_memory_id uuid references public.memory_records (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint recommendations_dedupe_uniq unique (user_id, dedupe_key),
  constraint recommendations_response_shape check (
    (status = 'open' and responded_at is null)
    or (status <> 'open' and responded_at is not null)
  ),
  constraint recommendations_modified_value check (status <> 'modified' or response_minor is not null)
);

create index recommendations_user_status_idx on public.recommendations (user_id, status, created_at desc);

alter table public.recommendations enable row level security;
revoke all on table public.recommendations from anon, authenticated;
grant select on table public.recommendations to authenticated;
grant insert (
  user_id, kind, dedupe_key, period, title, explanation, currency_code, suggested_minor,
  category_id, goal_id, evidence, memory_influence
) on table public.recommendations to authenticated;
create policy "Users can read their own recommendations"
  on public.recommendations for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Users can create their own open recommendations"
  on public.recommendations for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'open');

-- Linked category/goal must belong to the same user.
create or replace function private.guard_recommendation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.category_id is not null and not exists (
    select 1 from public.transaction_categories c where c.id = new.category_id and c.user_id = new.user_id
  ) then
    raise exception 'Category not found' using errcode = '42501';
  end if;
  if new.goal_id is not null and not exists (
    select 1 from public.savings_goals g where g.id = new.goal_id and g.user_id = new.user_id
  ) then
    raise exception 'Goal not found' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger recommendations_guard
  before insert on public.recommendations
  for each row execute function private.guard_recommendation();

/**
 * Records the user's decision on an open recommendation, once.
 * p_action: 'accepted' | 'rejected' | 'modified' (modified needs p_value_minor).
 * Returns the updated row as jsonb, or raises if it was already answered.
 */
create or replace function public.respond_to_recommendation(
  p_id uuid,
  p_action text,
  p_value_minor bigint default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_row public.recommendations%rowtype;
begin
  if v_user is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_action not in ('accepted', 'rejected', 'modified') then
    raise exception 'Invalid response' using errcode = '22023';
  end if;
  if p_action = 'modified' and (p_value_minor is null or p_value_minor < 0) then
    raise exception 'A modified response needs an amount' using errcode = '22023';
  end if;
  if p_note is not null and char_length(p_note) > 300 then
    raise exception 'Note is too long' using errcode = '22023';
  end if;

  update public.recommendations r
    set status = p_action,
        response_minor = case when p_action = 'modified' then p_value_minor else null end,
        response_note = nullif(btrim(coalesce(p_note, '')), ''),
        responded_at = now()
    where r.id = p_id and r.user_id = v_user and r.status = 'open'
    returning * into v_row;

  if not found then
    if exists (select 1 from public.recommendations r where r.id = p_id and r.user_id = v_user) then
      raise exception 'This recommendation has already been answered' using errcode = '55000';
    end if;
    raise exception 'Recommendation not found' using errcode = '42501';
  end if;

  perform private.write_audit(v_user, 'intelligence.recommendation_answered',
    jsonb_build_object('kind', v_row.kind, 'response', p_action));
  return to_jsonb(v_row);
end;
$$;

revoke all on function public.respond_to_recommendation(uuid, text, bigint, text) from public, anon;
grant execute on function public.respond_to_recommendation(uuid, text, bigint, text) to authenticated;
