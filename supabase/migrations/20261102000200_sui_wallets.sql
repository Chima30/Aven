-- =============================================================================
-- AVEN Stage 3 — Migration 9: Sui wallets (read-only) and confirmed imports
--
-- AVEN never holds keys, signs or sends anything. A user may add PUBLIC Sui
-- Mainnet addresses so AVEN can show on-chain balances and activity through
-- Tatum. On-chain data is displayed separately from AVEN's own records.
--
-- An on-chain transaction only becomes an AVEN transaction when the user
-- confirms it, and import_chain_transaction() refuses duplicates:
--   * the same digest can be imported once per user (unique constraint);
--   * a likely duplicate (same account, amount and date) needs explicit
--     confirmation from the user before it is created.
-- =============================================================================

create table public.sui_wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  network text not null default 'mainnet' check (network = 'mainnet'),
  address text not null check (address ~ '^0x[0-9a-f]{64}$'),
  label text check (label is null or char_length(btrim(label)) between 1 and 60),
  created_at timestamptz not null default now(),
  constraint sui_wallets_user_address_uniq unique (user_id, network, address)
);

create index sui_wallets_user_idx on public.sui_wallets (user_id);

-- At most 5 wallets per user (keeps provider usage predictable).
create or replace function private.guard_sui_wallet()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if (select count(*) from public.sui_wallets w where w.user_id = new.user_id) >= 5 then
      raise exception 'You can add up to 5 wallets' using errcode = '23514';
    end if;
  elsif new.user_id <> old.user_id or new.address <> old.address or new.network <> old.network then
    raise exception 'Only the wallet label can be changed' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger sui_wallets_guard
  before insert or update on public.sui_wallets
  for each row execute function private.guard_sui_wallet();

alter table public.sui_wallets enable row level security;
revoke all on table public.sui_wallets from anon, authenticated;
grant select, insert, delete on table public.sui_wallets to authenticated;
grant update (label) on table public.sui_wallets to authenticated;
create policy "Users can read their own wallets"
  on public.sui_wallets for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Users can add their own wallets"
  on public.sui_wallets for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "Users can rename their own wallets"
  on public.sui_wallets for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "Users can remove their own wallets"
  on public.sui_wallets for delete to authenticated
  using (user_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- Confirmed imports of on-chain transactions into AVEN's own records.
-- -----------------------------------------------------------------------------
create table public.chain_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  wallet_id uuid references public.sui_wallets (id) on delete set null,
  network text not null default 'mainnet' check (network = 'mainnet'),
  tx_digest text not null check (tx_digest ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'),
  -- Deleting the AVEN transaction removes the link, so it can be imported again.
  transaction_id uuid not null references public.transactions (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint chain_imports_digest_uniq unique (user_id, network, tx_digest)
);

create index chain_imports_tx_idx on public.chain_imports (transaction_id);

alter table public.chain_imports enable row level security;
revoke all on table public.chain_imports from anon, authenticated;
grant select on table public.chain_imports to authenticated;
create policy "Users can read their own chain imports"
  on public.chain_imports for select to authenticated
  using (user_id = (select auth.uid()));

/**
 * Import one on-chain transaction as an AVEN transaction, atomically.
 * The finance write still goes through apply_finance_mutation(), so every
 * Stage 2 rule (ownership, currency, versioning, idempotency) applies.
 *
 * Returns jsonb:
 *   { status: 'imported', transaction_id }            on success
 *   { status: 'duplicate_digest', transaction_id }    already imported
 *   { status: 'possible_duplicate', matches: [...] }  needs p_confirm_duplicate
 *   { status: 'rejected', message }                   finance rules refused it
 */
create or replace function public.import_chain_transaction(
  p_mutation_id uuid,
  p_wallet_id uuid,
  p_tx_digest text,
  p_transaction_id uuid,
  p_payload jsonb,
  p_confirm_duplicate boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_existing uuid;
  v_matches jsonb;
  v_result jsonb;
begin
  if v_user is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_tx_digest is null or p_tx_digest !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$' then
    raise exception 'Invalid transaction digest' using errcode = '22023';
  end if;
  if not exists (select 1 from public.sui_wallets w where w.id = p_wallet_id and w.user_id = v_user) then
    raise exception 'Wallet not found' using errcode = '42501';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Invalid payload' using errcode = '22023';
  end if;

  -- Serialise imports of the same digest for this user.
  perform pg_advisory_xact_lock(hashtextextended(v_user::text || ':sui:' || p_tx_digest, 0));

  select c.transaction_id into v_existing from public.chain_imports c
    where c.user_id = v_user and c.network = 'mainnet' and c.tx_digest = p_tx_digest;
  if v_existing is not null then
    return jsonb_build_object('status', 'duplicate_digest', 'transaction_id', v_existing);
  end if;

  if not coalesce(p_confirm_duplicate, false) then
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', t.id, 'occurred_on', t.occurred_on, 'amount_minor', t.amount_minor,
             'description', t.description) order by t.occurred_on), '[]'::jsonb)
      into v_matches
      from public.transactions t
      where t.user_id = v_user
        and t.account_id = (p_payload ->> 'account_id')::uuid
        and t.amount_minor = (p_payload ->> 'amount_minor')::bigint
        and t.occurred_on between (p_payload ->> 'occurred_on')::date - 1
                              and (p_payload ->> 'occurred_on')::date + 1;
    if jsonb_array_length(v_matches) > 0 then
      return jsonb_build_object('status', 'possible_duplicate', 'matches', v_matches);
    end if;
  end if;

  v_result := public.apply_finance_mutation(
    p_mutation_id, 'transaction', 'create', p_transaction_id, p_payload, null, null);
  if v_result ->> 'status' <> 'applied' then
    return jsonb_build_object('status', 'rejected',
      'message', coalesce(v_result ->> 'message', 'The transaction could not be saved.'));
  end if;

  insert into public.chain_imports (user_id, wallet_id, tx_digest, transaction_id)
  values (v_user, p_wallet_id, p_tx_digest, p_transaction_id);

  perform private.write_audit(v_user, 'finance.chain_import',
    jsonb_build_object('network', 'mainnet', 'transaction_id', p_transaction_id));

  return jsonb_build_object('status', 'imported', 'transaction_id', p_transaction_id);
end;
$$;

revoke all on function public.import_chain_transaction(uuid, uuid, text, uuid, jsonb, boolean) from public, anon;
grant execute on function public.import_chain_transaction(uuid, uuid, text, uuid, jsonb, boolean) to authenticated;
