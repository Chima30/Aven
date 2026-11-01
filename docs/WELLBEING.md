# Wellbeing

Sleep, water, meals, activity and mood at **/wellbeing**. AVEN is **not a medical service**: it
never diagnoses, never estimates calories or nutrition, and never fills in missing days.

## Consent

Logging needs **Store wellbeing information** (`wellbeing_data`) in Settings → Privacy. This is
enforced **in the database** — `apply_life_mutation()` refuses wellbeing records without it —
not just hidden in the UI. Deleting your own logs is always allowed. Withdrawing consent stops new
logs; existing ones stay until you delete them (or your account).

## Logs

| Log      | Stored as                                                       | Notes                                                                                                                                         |
| -------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Sleep    | exact instants `slept_at`, `woke_at` + local `wake_date`        | Duration is a generated column (`woke_at − slept_at`), so overnight sleep and DST changes are exact. Max 20 h. Optional quality 1–5 and note. |
| Water    | `amount_ml` (integer) + `logged_at` + local date                | Shown in **ml, L or US fl oz** (1 fl oz = 29.5735 ml). Daily target in Wellbeing settings. Quick buttons.                                     |
| Meals    | meal type + **your description** + time                         | No calorie or nutrition fields exist at all.                                                                                                  |
| Activity | type, minutes, optional distance in **metres**, intensity, date | Shown in km or miles.                                                                                                                         |
| Mood     | mood, energy, stress (and sleep/day for Pulse Checks), 1–5 each | Every question can be skipped; at least one answer or a note is required. `source` = `wellbeing` or `pulse_check`.                            |

Units are converted only for display and entry; changing units never changes stored records.
All quick logs go through the **offline outbox** and sync exactly once.

## Dashboard and trends

`/wellbeing` shows today (water vs target, last sleep, active minutes, meals, latest mood) and
7-day trends; each section page shows 14-day trends and history. Days without a record are
shown as **empty**, never as zero.

## Walrus Memory (wellbeing)

Needs **both** _Store wellbeing information_ and _Remember wellbeing routines_. Only banded
pattern summaries are stored — usual bedtime and average sleep, how often the water target is
met, activity routine, meal-logging routine and broad mood trend. **Never** individual logs,
notes, meal descriptions or medical conclusions. Suggestions are routine-based (e.g. a
wind-down habit) and say they aren't medical advice.

## Out of scope

Medical diagnosis, wearable sync, calorie or nutrition estimates.
