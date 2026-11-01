# Nudge Center and Pulse Check

## Principle

AVEN should feel calm. Most events are bundled into a daily Pulse Check or weekly review;
individual nudges are rare, respect quiet hours, and never exceed the user's daily cap.
**Deterministic rules decide delivery. AI may later help word a summary but cannot change
whether, when or how often anyone is notified.**

## Status

- ✅ **Nudge Center** at `/nudges`: unified inbox (title, body, category, priority, read state,
  "Open" link), filters by category and unread, mark read/unread, mark all read, dismiss.
- ✅ **History** at `/nudges/history`: everything the rules produced, including nudges held for
  quiet hours, bundled into a summary, or not shown because of your settings — each with its reason.
  Dismissed items can be restored.
- ✅ **"Your day in AVEN"** daily summary and a weekly summary, built only from real records
  (no summary at all on a day with nothing real to report).
- ✅ **Pulse Check** at `/nudges/pulse`: optional, private, every question skippable, not medical.
  Stored in `mood_logs` with `source = 'pulse_check'` (one place for how you feel), works offline,
  shows simple patterns (last 7 days vs the 3 weeks before). AVEN never prompts or nags for it.
- ✅ **Server-side scheduler** every ~15 minutes plus catch-up — see SCHEDULER.md. Browser timers
  are never relied on.
- ✅ Preferences (Settings → Notifications): right away / daily / weekly / off per category,
  quiet hours, pause, daily limit. New category: **Suggestions** (memory-based suggestions).
- ❌ **No push notifications** to phones yet (requirements in SCHEDULER.md). Nudges appear inside AVEN.

## Rules that produce nudges (deterministic; AI can't override)

| Kind             | When                                                             | Dedupe                   |
| ---------------- | ---------------------------------------------------------------- | ------------------------ |
| Task reminder    | the reminder time you set (sent up to 6 h late if AVEN was down) | per task + reminder time |
| Task due         | open task due within 3 hours                                     | per task + due date      |
| Event reminder   | `reminder_minutes` before each occurrence                        | per occurrence           |
| Habit reminder   | reminder time, if not checked in yet                             | per habit + day          |
| Habit missed     | 3 scheduled days in a row missed — gentle "No pressure" wording  | at most weekly           |
| Streak           | 7, 30, 100 and 365-day milestones, from check-in events          | per milestone            |
| Review due       | your daily/weekly review time, if not written yet                | per period               |
| Budget / savings | from `finance_events` (threshold, exceeded, milestone)           | per event                |
| Summaries        | at your digest time (within 6 h)                                 | per day / week           |
| Suggestion       | memory-based suggestion shown in Planning/Wellbeing              | per suggestion + week    |

Every candidate then passes `decideDelivery()`: deliver, defer for quiet hours, bundle into a
digest, or suppress — and the decision is stored with the notification.

## Delivery rules (in order)

1. `account_security` is essential → delivered in-app immediately.
2. Topic set to **off** → suppressed.
3. **Pause non-essential** on → suppressed.
4. In-app notifications off → suppressed.
5. Topic set to **daily/weekly digest** → bundled (falls back to the other digest; suppressed if both are off).
6. Topic set to **right away**: inside quiet hours → **deferred** until quiet hours end in the
   user's time zone — unless the _user_ scheduled that exact reminder.
7. Daily cap reached → folded into the daily summary.

An event created by AI (`source: "ai"`) can never claim to be user-scheduled, so it can never
bypass quiet hours or the daily cap (tested).
