"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { useTransactionOutbox } from "@/lib/finance/use-outbox";
import { describeLifeEntry, queueLife } from "@/lib/life/queue";
import { LIFE_PAYLOADS, type OfflineLifeEntity } from "@/lib/life/schemas";
import { addDays, localDate, timeToMinutes, zonedToInstant } from "@/lib/time/zoned";
import {
  SCALE_LABELS,
  distanceToMetres,
  waterToMl,
  type DistanceUnit,
  type WaterUnit,
} from "@/lib/wellbeing/units";

/**
 * Wellbeing quick-log forms. Every entry goes through the offline outbox
 * (IndexedDB → /api/sync → apply_life_mutation), so logging works without a
 * connection and syncs exactly once. The payload is validated here with the
 * same Zod schema the server uses, then again on the server and in Postgres.
 */

interface Common {
  userId: string;
  timeZone: string;
}

function nowLocal(timeZone: string) {
  const now = new Date();
  const date = localDate(now, timeZone);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now);
  return { date, time: parts };
}

function useLogger(userId: string) {
  const toast = useToast();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  async function submit(
    entity: OfflineLifeEntity,
    payload: Record<string, unknown>,
    success: string,
    keyFor?: (path: string) => string,
  ) {
    const check = LIFE_PAYLOADS[entity].safeParse(payload);
    if (!check.success) {
      const next: Record<string, string> = {};
      for (const issue of check.error.issues) {
        const key = keyFor ? keyFor(String(issue.path[0] ?? "")) : String(issue.path[0] ?? "_form");
        if (!next[key || "_form"]) next[key || "_form"] = issue.message;
      }
      setErrors(next);
      return false;
    }
    setErrors({});
    setBusy(true);
    try {
      await queueLife(userId, entity, "create", check.data);
      toast(
        navigator.onLine ? success : `${success} It will sync when you're back online.`,
        "success",
      );
      return true;
    } catch {
      toast("That couldn't be saved on this device.", "error");
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { errors, setErrors, busy, submit };
}

function FormError({ message }: { message?: string }) {
  return message ? (
    <p role="alert" className="text-danger text-sm">
      {message}
    </p>
  ) : null;
}

function LocalDateTime({
  prefix,
  label,
  timeZone,
  errors,
}: {
  prefix: string;
  label: string;
  timeZone: string;
  errors: Record<string, string>;
}) {
  const n = nowLocal(timeZone);
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field id={`${prefix}_date`} label={`${label} date`} error={errors[`${prefix}_date`]}>
        {(a) => <Input {...a} type="date" defaultValue={n.date} max={n.date} required />}
      </Field>
      <Field id={`${prefix}_time`} label="Time" error={errors[`${prefix}_time`]}>
        {(a) => <Input {...a} type="time" defaultValue={n.time} required />}
      </Field>
    </div>
  );
}

function at(form: FormData, prefix: string, timeZone: string) {
  const date = String(form.get(`${prefix}_date`) ?? "");
  const time = String(form.get(`${prefix}_time`) ?? "");
  if (!date || !time) return null;
  return { date, instant: zonedToInstant(date, timeToMinutes(time), timeZone) };
}

// ---------------------------------------------------------------------------

export function WaterQuickLog({ userId, timeZone, unit }: Common & { unit: WaterUnit }) {
  const { errors, setErrors, busy, submit } = useLogger(userId);
  const presets: Array<[string, number]> =
    unit === "fl_oz"
      ? [
          ["8 fl oz", 8],
          ["12 fl oz", 12],
          ["16 fl oz", 16],
        ]
      : [
          ["250 ml", 250],
          ["500 ml", 500],
          ["750 ml", 750],
        ];
  const presetUnit: WaterUnit = unit === "fl_oz" ? "fl_oz" : "ml";
  const log = async (amount: number, u: WaterUnit) => {
    if (!(amount > 0)) {
      setErrors({ amount: "Enter an amount." });
      return false;
    }
    const now = new Date();
    return submit(
      "water_log",
      {
        amount_ml: waterToMl(amount, u),
        logged_at: now.toISOString(),
        local_date: localDate(now, timeZone),
      },
      "Water logged.",
      () => "amount",
    );
  };
  return (
    <div className="flex flex-col gap-3" data-testid="water-quick-log">
      <div className="flex flex-wrap gap-2">
        {presets.map(([label, amount]) => (
          <Button
            key={label}
            type="button"
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => log(amount, presetUnit)}
          >
            + {label}
          </Button>
        ))}
      </div>
      <form
        className="flex items-end gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const amount = Number(new FormData(form).get("amount"));
          if (await log(amount, unit)) form.reset();
        }}
      >
        <Field
          id="amount"
          label={`Other amount (${unit === "fl_oz" ? "fl oz" : unit === "l" ? "L" : "ml"})`}
          error={errors.amount}
        >
          {(a) => (
            <Input
              {...a}
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              required
              className="w-36"
            />
          )}
        </Field>
        <Button type="submit" size="sm" disabled={busy}>
          Log
        </Button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function SleepLogForm({ userId, timeZone }: Common) {
  const { errors, setErrors, busy, submit } = useLogger(userId);
  const n = nowLocal(timeZone);
  return (
    <LogForm
      submitLabel="Log sleep"
      busy={busy}
      onSubmit={async (form) => {
        const fd = new FormData(form);
        const bed = at(fd, "bed", timeZone);
        const wake = at(fd, "wake", timeZone);
        if (!bed || !wake) {
          setErrors({ _form: "Enter both bedtime and wake-up time." });
          return false;
        }
        return submit(
          "sleep_log",
          {
            slept_at: bed.instant.toISOString(),
            woke_at: wake.instant.toISOString(),
            wake_date: wake.date,
            quality: numOrNull(fd.get("quality")),
            note: strOrNull(fd.get("note")),
          },
          "Sleep logged.",
        );
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field id="bed_date" label="Went to sleep">
          {(a) => (
            <Input {...a} type="date" defaultValue={addDays(n.date, -1)} max={n.date} required />
          )}
        </Field>
        <Field id="bed_time" label="At">
          {(a) => <Input {...a} type="time" defaultValue="23:00" required />}
        </Field>
        <Field id="wake_date" label="Woke up">
          {(a) => <Input {...a} type="date" defaultValue={n.date} max={n.date} required />}
        </Field>
        <Field id="wake_time" label="At">
          {(a) => <Input {...a} type="time" defaultValue="07:00" required />}
        </Field>
      </div>
      <RatingField
        name="quality"
        label="How was it? (optional)"
        labels={SCALE_LABELS.sleep_rating}
      />
      <NoteField />
      <FormError message={errors._form ?? errors.slept_at ?? errors.woke_at} />
    </LogForm>
  );
}

// ---------------------------------------------------------------------------

export function MealLogForm({ userId, timeZone }: Common) {
  const { errors, busy, submit } = useLogger(userId);
  return (
    <LogForm
      submitLabel="Log meal"
      busy={busy}
      onSubmit={async (form) => {
        const fd = new FormData(form);
        const when = at(fd, "meal", timeZone);
        return submit(
          "meal_log",
          {
            meal_type: String(fd.get("meal_type")),
            description: String(fd.get("description") ?? "").trim(),
            eaten_at: when?.instant.toISOString() ?? "",
            local_date: when?.date ?? "",
            note: strOrNull(fd.get("note")),
          },
          "Meal logged.",
        );
      }}
    >
      <Field id="meal_type" label="Meal">
        {(a) => (
          <Select {...a} defaultValue="lunch">
            <option value="breakfast">Breakfast</option>
            <option value="lunch">Lunch</option>
            <option value="dinner">Dinner</option>
            <option value="snack">Snack</option>
          </Select>
        )}
      </Field>
      <Field
        id="description"
        label="What did you have?"
        hint="Just a description — AVEN doesn't estimate calories or nutrition."
        error={errors.description}
      >
        {(a) => (
          <Input {...a} maxLength={300} required placeholder="e.g. Jollof rice and chicken" />
        )}
      </Field>
      <LocalDateTime prefix="meal" label="Meal" timeZone={timeZone} errors={errors} />
      <NoteField />
      <FormError message={errors._form ?? errors.eaten_at} />
    </LogForm>
  );
}

// ---------------------------------------------------------------------------

export function ActivityLogForm({
  userId,
  timeZone,
  distanceUnit,
}: Common & { distanceUnit: DistanceUnit }) {
  const { errors, setErrors, busy, submit } = useLogger(userId);
  const n = nowLocal(timeZone);
  return (
    <LogForm
      submitLabel="Log activity"
      busy={busy}
      onSubmit={async (form) => {
        const fd = new FormData(form);
        const distance = String(fd.get("distance") ?? "").trim();
        if (distance !== "" && !(Number(distance) >= 0)) {
          setErrors({ distance: "Enter a distance, or leave it empty." });
          return false;
        }
        return submit(
          "activity_log",
          {
            activity_type: String(fd.get("activity_type")),
            duration_minutes: Math.round(Number(fd.get("duration_minutes"))),
            distance_m:
              distance === "" || Number(distance) === 0
                ? null
                : distanceToMetres(Number(distance), distanceUnit),
            intensity: strOrNull(fd.get("intensity")),
            on_date: String(fd.get("on_date") ?? ""),
            note: strOrNull(fd.get("note")),
          },
          "Activity logged.",
          (p) => (p === "distance_m" ? "distance" : p),
        );
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="activity_type" label="Activity">
          {(a) => (
            <Select {...a} defaultValue="walking">
              <option value="walking">Walking</option>
              <option value="running">Running</option>
              <option value="cycling">Cycling</option>
              <option value="gym">Gym</option>
              <option value="swimming">Swimming</option>
              <option value="sports">Sports</option>
              <option value="home_workout">Home workout</option>
              <option value="other">Other</option>
            </Select>
          )}
        </Field>
        <Field id="on_date" label="Date" error={errors.on_date}>
          {(a) => <Input {...a} type="date" defaultValue={n.date} max={n.date} required />}
        </Field>
        <Field id="duration_minutes" label="Duration (minutes)" error={errors.duration_minutes}>
          {(a) => <Input {...a} type="number" inputMode="numeric" min="1" max="1440" required />}
        </Field>
        <Field id="distance" label={`Distance (${distanceUnit}, optional)`} error={errors.distance}>
          {(a) => <Input {...a} type="number" inputMode="decimal" min="0" step="any" />}
        </Field>
        <Field id="intensity" label="Intensity (optional)">
          {(a) => (
            <Select {...a} defaultValue="">
              <option value="">—</option>
              <option value="light">Light</option>
              <option value="moderate">Moderate</option>
              <option value="vigorous">Vigorous</option>
            </Select>
          )}
        </Field>
      </div>
      <NoteField />
      <FormError message={errors._form} />
    </LogForm>
  );
}

// ---------------------------------------------------------------------------

const MOOD_QUESTIONS = [
  { name: "mood", label: "How are you feeling?", labels: SCALE_LABELS.mood },
  { name: "energy", label: "Energy", labels: SCALE_LABELS.energy },
  { name: "stress", label: "Stress", labels: SCALE_LABELS.stress },
] as const;
const PULSE_QUESTIONS = [
  ...MOOD_QUESTIONS,
  { name: "sleep_rating", label: "How did you sleep?", labels: SCALE_LABELS.sleep_rating },
  { name: "day_rating", label: "How is your day going?", labels: SCALE_LABELS.day_rating },
] as const;

/** Mood check-in, or the optional Pulse Check (every question can be skipped). */
export function MoodLogForm({
  userId,
  timeZone,
  source = "wellbeing",
}: Common & { source?: "wellbeing" | "pulse_check" }) {
  const { errors, busy, submit } = useLogger(userId);
  const questions = source === "pulse_check" ? PULSE_QUESTIONS : MOOD_QUESTIONS;
  return (
    <LogForm
      submitLabel={source === "pulse_check" ? "Save Pulse Check" : "Save check-in"}
      busy={busy}
      onSubmit={async (form) => {
        const fd = new FormData(form);
        const now = new Date();
        const payload: Record<string, unknown> = {
          logged_at: now.toISOString(),
          local_date: localDate(now, timeZone),
          note: strOrNull(fd.get("note")),
          source,
        };
        for (const q of questions) payload[q.name] = numOrNull(fd.get(q.name));
        return submit(
          "mood_log",
          payload,
          source === "pulse_check" ? "Pulse Check saved. Thank you." : "Check-in saved.",
          () => "_form",
        );
      }}
    >
      {questions.map((q) => (
        <RatingField key={q.name} name={q.name} label={q.label} labels={q.labels} />
      ))}
      <NoteField label="Anything on your mind? (optional, private)" />
      <FormError message={errors._form} />
    </LogForm>
  );
}

// ---------------------------------------------------------------------------

function LogForm({
  children,
  submitLabel,
  busy,
  onSubmit,
}: {
  children: ReactNode;
  submitLabel: string;
  busy: boolean;
  onSubmit: (form: HTMLFormElement) => Promise<boolean>;
}) {
  const ref = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={ref}
      noValidate
      className="flex flex-col gap-4"
      onSubmit={async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const form = e.currentTarget;
        if (await onSubmit(form)) form.reset();
      }}
    >
      {children}
      <div>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}

function RatingField({
  name,
  label,
  labels,
}: {
  name: string;
  label: string;
  labels: readonly string[];
}) {
  return (
    <fieldset>
      <legend className="text-ink mb-2 text-sm font-medium">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        <label className="has-[:checked]:border-accent has-[:checked]:text-ink border-line text-ink-muted cursor-pointer rounded-lg border px-2.5 py-1.5 text-xs">
          <input type="radio" name={name} value="" defaultChecked className="sr-only" />
          Skip
        </label>
        {labels.map((l, i) => (
          <label
            key={l}
            className={cn(
              "has-[:checked]:border-accent has-[:checked]:bg-accent/10 has-[:checked]:text-ink border-line text-ink-muted cursor-pointer rounded-lg border px-2.5 py-1.5 text-xs",
              "has-[:focus-visible]:ring-accent has-[:focus-visible]:ring-2",
            )}
          >
            <input type="radio" name={name} value={i + 1} className="sr-only" />
            {i + 1} · {l}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function NoteField({ label = "Note (optional)" }: { label?: string }) {
  return (
    <Field id="note" label={label}>
      {(a) => <Textarea {...a} maxLength={500} rows={2} />}
    </Field>
  );
}

function numOrNull(v: FormDataEntryValue | null): number | null {
  const s = typeof v === "string" ? v.trim() : "";
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function strOrNull(v: FormDataEntryValue | null): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
}

// ---------------------------------------------------------------------------

/** Remove a log (queued, so it also works offline). */
export function DeleteLog({
  userId,
  entity,
  id,
  version,
  label,
}: {
  userId: string;
  entity: OfflineLifeEntity;
  id: string;
  version: number;
  label: string;
}) {
  const toast = useToast();
  const [state, setState] = useState<"idle" | "confirm" | "done">("idle");
  if (state === "done") return <span className="text-ink-subtle text-xs">Removing…</span>;
  return (
    <button
      type="button"
      className={cn(
        "text-xs underline",
        state === "confirm" ? "text-danger" : "text-ink-muted hover:text-ink",
      )}
      aria-label={state === "confirm" ? `Confirm delete ${label}` : `Delete ${label}`}
      onClick={async () => {
        if (state === "idle") return setState("confirm");
        try {
          await queueLife(userId, entity, "delete", {}, { recordId: id, baseVersion: version });
          setState("done");
        } catch {
          toast("That couldn't be removed on this device.", "error");
          setState("idle");
        }
      }}
    >
      {state === "confirm" ? "Confirm delete" : "Delete"}
    </button>
  );
}

/** Entries saved on this device that haven't reached the server yet. */
export function PendingLogs({
  userId,
  entities,
}: {
  userId: string;
  entities: OfflineLifeEntity[];
}) {
  const entries = useTransactionOutbox(userId, "all").filter((e) =>
    (entities as string[]).includes(e.entity),
  );
  if (entries.length === 0) return null;
  return (
    <div
      className="border-line rounded-xl border border-dashed px-3 py-2 text-sm"
      data-testid="pending-logs"
    >
      <p className="text-ink font-medium">Waiting to sync ({entries.length})</p>
      <ul className="text-ink-muted mt-1 text-xs">
        {entries.slice(0, 8).map((e) => (
          <li key={e.mutationId}>
            {describeLifeEntry(
              e.entity,
              e.operation,
              e.payload as unknown as Record<string, unknown>,
            )}
            {e.status !== "pending" && e.status !== "syncing"
              ? " — needs attention in the Sync center"
              : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}
