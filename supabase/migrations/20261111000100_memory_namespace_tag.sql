-- =============================================================================
-- Stage 12 · Notice if the Walrus Memory namespace changes
-- =============================================================================

-- Each user's Walrus namespace is derived from MEMWAL_NAMESPACE and
-- MEMWAL_NAMESPACE_SECRET. If either is changed or lost, AVEN would silently
-- start a new, empty namespace and every earlier memory would be unreachable.
--
-- New memories now record a short tag of the namespace they were written to
-- (a one-way hash; it can't be used to read anything). If the current settings
-- produce a different namespace, AVEN stops using memory and reports a
-- configuration problem instead of quietly losing everyone's history.
alter table public.memory_records
  add column namespace_tag text
  check (namespace_tag is null or namespace_tag ~ '^[0-9a-f]{16}$');

create index memory_records_user_tag_idx
  on public.memory_records (user_id, created_at desc)
  where namespace_tag is not null;
