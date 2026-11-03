-- =============================================================================
-- Stage 8 · Retire the old, noisy goal-progress memories
-- =============================================================================

-- Before the fix, AVEN wrote a new goal-progress memory every time a goal
-- crossed another 10% (and even at 0%), labelled with last month but using
-- today's balance. Those rows have labels without a month ("Goal progress ·
-- Rent"); the corrected memories end in the month ("Goal progress · Rent ·
-- 2026-10").
--
-- This marks the old ones as forgotten, exactly like pressing Forget: AVEN
-- stops reading and recalling them, and the same text is never written again.
-- (Walrus itself is permanent storage, so nothing is deleted there.)
update public.memory_records
set status = 'suppressed',
    suppressed_at = now(),
    pending_text = null
where kind = 'goal_progress'
  and status <> 'suppressed'
  and label !~ ' · [0-9]{4}-[0-9]{2}$';
