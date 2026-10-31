# Nudge Center and Pulse Check

## Principle

AVEN should feel calm. Most events are bundled into a daily Pulse Check or weekly review;
individual nudges are rare, respect quiet hours, and never exceed the user's daily cap.
**Deterministic rules decide delivery. AI may later help word a summary but cannot change
whether, when or how often anyone is notified.**

## Stage 1 status

- ✅ `notification_preferences` and `notification_category_preferences` tables (RLS, tested)
- ✅ Settings → Notifications page (real, saved preferences)
- ✅ Delivery engine `decideDelivery()` in `src/lib/nudges/engine.ts`, fully unit-tested,
  including time zones and daylight-saving changes
- ❌ No notifications are created or sent, and none are faked

## Delivery rules (in order)

1. `account_security` is essential → delivered in-app immediately.
2. Topic set to **off** → suppressed.
3. **Pause non-essential** on → suppressed.
4. In-app notifications off → suppressed.
5. Topic set to **daily/weekly digest** → bundled (falls back to the other digest; suppressed if both are off).
6. Topic set to **right away**: inside quiet hours → **deferred** until quiet hours end in the
   user's time zone — unless the _user_ scheduled that exact reminder.
7. Daily cap reached → folded into the daily Pulse Check.

An event created by AI (`source: "ai"`) can never claim to be user-scheduled, so it can never
bypass quiet hours or the daily cap (tested).

## Planned event and scheduling architecture (Stage 3)

```
Domain change (e.g. subscription renewal date) ─► nudge_events (deterministic producer, idempotent key)
                                                       │
Scheduler (Supabase Cron / pg_cron, every few minutes) ─┤─► decideDelivery() rules
                                                       ├─► deliver_now → notifications (in-app inbox)
                                                       ├─► defer      → scheduled_for = quiet-hours end
                                                       └─► bundle     → digest_items → Pulse Check at digest time
```

- Runs **server-side on a schedule**, so nothing depends on an open browser.
- Tables to add in Stage 3: `nudge_events`, `notifications`, `digest_runs`, `digest_items`.
- Every event has a dedupe key (e.g. `subscription:<id>:renewal:<date>`) so reruns never duplicate.
- Email and push channels stay disabled until they are built, tested and consented to.
