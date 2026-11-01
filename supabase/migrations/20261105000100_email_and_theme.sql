-- =============================================================================
-- Stage 6 · Opt-in email notifications and the new default look
-- =============================================================================

-- Email is OFF by default (existing column). Users choose whether to turn it on
-- and what to receive: only summaries and important nudges, or everything that
-- reaches their Nudge Center inbox.
alter table public.notification_preferences
  add column email_mode text not null default 'summaries'
    check (email_mode in ('summaries', 'all'));

grant update (email_enabled, email_mode) on table public.notification_preferences to authenticated;

-- Server-side bookkeeping so every notification is emailed at most once.
-- Users still can only change read_at / dismissed_at (see the column grant).
alter table public.notifications
  add column emailed_at timestamptz,
  add column email_attempts smallint not null default 0 check (email_attempts between 0 and 10);

create index notifications_email_pending_idx
  on public.notifications (user_id, created_at)
  where emailed_at is null and status = 'delivered';

-- AVEN's default look is now the dark theme. "system" was only ever the
-- default (never an explicit choice in the old UI's first run), so it moves too.
alter table public.user_preferences alter column theme set default 'dark';
update public.user_preferences set theme = 'dark' where theme = 'system';
