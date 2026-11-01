# Background scheduler (Nudge Center)

Reminders must arrive even when nobody has AVEN open, so they are produced **on the server on a
schedule**, never by browser timers.

## How it works

`/api/cron/nudges` runs `runNudgeScheduler()` (`src/lib/nudges/runner.ts`):

1. Releases nudges that were waiting for quiet hours to end.
2. For each user, loads their real records and runs the pure rule engine
   (`src/lib/nudges/scheduler.ts` + `decideDelivery()`): task reminders and deadlines, event
   reminders, habit reminders, gentle missed-habit and streak messages, review reminders, budget
   and savings alerts, and the daily/weekly summaries.
3. Inserts notifications with a **dedupe key** (unique per user), so running twice — or two
   triggers overlapping — never creates duplicates.
4. Marks the finance and life events it processed, and logs the run in `scheduler_runs`.

The endpoint refuses every request without `Authorization: Bearer <CRON_SECRET>` (constant-time
comparison) and returns 503 if `CRON_SECRET` isn't set.

## Triggers

| Trigger                                                      | Frequency                                  | Set up                                                    |
| ------------------------------------------------------------ | ------------------------------------------ | --------------------------------------------------------- |
| **GitHub Actions** (`.github/workflows/nudge-scheduler.yml`) | every 15 minutes                           | Repository secrets `AVEN_URL` and `CRON_SECRET`           |
| **Vercel Cron** (`vercel.json`)                              | once a day (Hobby plan limit)              | `CRON_SECRET` in Vercel — Vercel sends it automatically   |
| **Catch-up**                                                 | when you open Planning or the Nudge Center | nothing — runs for that user only, after the page is sent |

GitHub may delay scheduled runs at busy times and pauses schedules after 60 days with no
repository activity. Reminders are therefore "within about 15 minutes", and the catch-up covers
gaps whenever you open AVEN. The Nudge Center shows when the scheduler last ran.

## Setup (no terminal needed)

1. Make a long random password (32+ characters, letters and numbers), e.g. with a password
   manager. This is your `CRON_SECRET`. Never put it in a file in the repository.
2. **Vercel** → your project → Settings → Environment Variables → add `CRON_SECRET` (Production)
   → Redeploy.
3. **GitHub** → your repository → Settings → Secrets and variables → Actions → New repository
   secret: `CRON_SECRET` (same value) and `AVEN_URL` (e.g. `https://aven-ashy.vercel.app`).
4. GitHub → Actions → **Nudge scheduler** → Run workflow, to test. A green tick means it worked.

The scheduler also needs `SUPABASE_SECRET_KEY` (already required by earlier stages); it is used
only on the server.

## Push notifications

**Not implemented.** Nudges appear in the in-app Nudge Center. Web Push would additionally need:
VAPID keys (server-only private key), a `push_subscriptions` table with RLS, a permission prompt
the user opts into, service-worker `push`/`notificationclick` handlers, sending from the scheduler
via the Web Push protocol, and iOS support only for installed PWAs (iOS 16.4+). None of this is
claimed to work today.
