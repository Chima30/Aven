# Planning

Calendar, tasks, habits and private reviews at **/planning**. Everything is a real record the
user created — AVEN never invents events, tasks or activity.

## Where things live

| Area     | Route                | Tables                                         |
| -------- | -------------------- | ---------------------------------------------- |
| Today    | `/planning`          | reads all of the below                         |
| Calendar | `/planning/calendar` | `calendar_events`, `calendar_event_exceptions` |
| Tasks    | `/planning/tasks`    | `tasks`, `task_categories`                     |
| Habits   | `/planning/habits`   | `habits`, `habit_check_ins`                    |
| Reviews  | `/planning/reviews`  | `reviews`, `planning_preferences`              |

All writes go through one database function, `apply_life_mutation()` (see DATABASE.md):
validated by Zod in the app, again by the function's column whitelist, and again by CHECK
constraints and ownership triggers. Users have **no** direct insert/update/delete rights on
these tables.

## Calendar

- **Month, week and day views** with previous/next/today navigation.
- **Timed events** store exact instants (`starts_at`, `ends_at`); **all-day events** store local
  dates. Each event keeps its own **time zone**, so "09:00 every Monday in Lagos" stays 09:00
  across daylight-saving changes elsewhere.
- **Recurrence**: daily, weekly (chosen weekdays), monthly, yearly, with interval and optional end
  date. Occurrences are **expanded when read** (`src/lib/planning/recurrence.ts`), never copied
  into the table — so there are no duplicates to drift apart.
- **Exceptions**: cancelling a single occurrence writes one `calendar_event_exceptions` row keyed by
  `(event_id, occurrence_date)` (unique), so the rest of the series is untouched.
- Monthly events on the 31st skip months without a 31st (never moved to another day).
- Wall-clock → instant conversion follows the Temporal "compatible" rule: in a clocks-back hour the
  earlier instant is used, in a clocks-forward gap the time moves forward.
- Categories: personal, work, health, finance, social, learning, other. Optional reminder.

## Tasks

- Status: **not started, in progress, completed, cancelled**. `completed_at` is stamped by the
  database exactly when status becomes completed (and cleared otherwise).
- Priority, due date/time, reminder (date + time in your zone), category, notes.
- Views: **to do, today, upcoming, overdue, completed, all**, plus a category filter. High-priority
  tasks are marked in every list.
- Ticking a task done uses the **offline outbox**, so it works without a connection.

## Habits

- Every day, or chosen weekdays; start and optional end date; reminder time; time zone; archive.
- One check-in per habit per local day (unique). The database rejects check-ins in the future (in
  the habit's zone) or outside the habit's date range.
- **Streaks** count scheduled days in local dates. "Skipped" keeps a streak; **today never breaks
  a streak** (the day isn't over). Also shown: longest streak, consistency %, missed days, weekly
  and monthly history.
- Wording is never shaming: missed days are shown as plain facts, and the "missed 3 days" nudge
  says _"No pressure"_ and is sent at most once a week.
- Check-ins work offline (outbox).

## Reviews

- **Daily** and **weekly** reviews: what went well, what was missed, next focus, notes, rating.
  One per period (unique), private to you.
- Review reminders come from the Nudge Center at the times you set.
- Optional per review: **"Remember this focus"** saves only the next-focus answer to Walrus Memory
  (needs the _Remember planning preferences_ consent).

## Walrus Memory (planning)

With **Remember planning preferences** granted, AVEN stores short **pattern summaries** — never
task titles or calendar details: usual time of day per habit (banded consistency, weakest
weekday), preferred part of day, review timing, and notification preferences. Summaries are
computed over a window ending **yesterday** and banded, so an unchanged pattern produces the same
text and is deduplicated by content hash (no repeat writes).

Recalled memories feed **deterministic suggestions** on the Today page, e.g. "Move the Read
reminder to the evening?". Each suggestion names the memory and Walrus blob it came from;
current records override an outdated memory; nothing changes unless you act.
