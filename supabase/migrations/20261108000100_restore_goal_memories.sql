-- =============================================================================
-- Stage 9 · Bring back the goal-progress memories Stage 8 hid
-- =============================================================================

-- Stage 8 marked the older goal-progress memories as forgotten. That was not
-- wanted: they are kept as history. This undoes exactly that cleanup.
--
-- Stage 8 ran as one statement, so every row it hid for a user shares the same
-- suppressed_at. A memory the user forgot themselves with the Forget button
-- has its own timestamp and stays forgotten. Only memories that were already
-- stored on Walrus (they have a blob id) are restored.

alter table public.memory_records disable trigger memory_records_guard_update;

with batch as (
  select user_id, suppressed_at
  from public.memory_records
  where kind = 'goal_progress'
    and status = 'suppressed'
    and label !~ ' · [0-9]{4}-[0-9]{2}$'
  group by user_id, suppressed_at
  having count(*) > 1
)
update public.memory_records m
set status = 'stored',
    suppressed_at = null
from batch b
where m.user_id = b.user_id
  and m.suppressed_at = b.suppressed_at
  and m.kind = 'goal_progress'
  and m.blob_id is not null;

alter table public.memory_records enable trigger memory_records_guard_update;
