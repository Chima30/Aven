-- =============================================================================
-- Stage 7 · Unread count on the Nudge Center
-- =============================================================================

-- When the user last opened the Nudge Center. The sidebar shows how many
-- notifications arrived after this moment; opening the Nudge Center resets it.
-- Each notification keeps its own read/unread state separately (read_at).
alter table public.notification_preferences
  add column nudges_seen_at timestamptz;

grant update (nudges_seen_at) on table public.notification_preferences to authenticated;

-- Fast count of new notifications for the badge.
create index notifications_badge_idx
  on public.notifications (user_id, delivered_at)
  where status = 'delivered' and dismissed_at is null and read_at is null;
