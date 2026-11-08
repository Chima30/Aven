-- =============================================================================
-- Stage 11 · Fair reminder scheduling as AVEN grows
-- =============================================================================

-- Each scheduler run has about 50 seconds. Runs used to start from the first
-- user every time, so once there were more users than fit in one run, the same
-- users at the end of the list never got their reminders. Each run now records
-- the last user it reached, and the next run carries on from there (wrapping
-- round), so every user gets their turn.
alter table public.scheduler_runs
  add column last_user_id uuid;
