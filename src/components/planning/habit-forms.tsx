"use client";

import { useState } from "react";
import { archiveHabitAction, saveHabitAction } from "@/app/(app)/planning/actions";
import { ActionForm } from "@/components/finance/action-form";
import { FormDialog } from "@/components/finance/form-dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { InlineAction } from "@/components/ui/inline-action";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { queueLife } from "@/lib/life/queue";
import type { HabitCheckInRow, HabitRow } from "@/lib/supabase/database.types";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function HabitDialog({
  habit,
  today,
  label,
  variant = "primary",
  size = "md",
}: {
  habit?: Pick<
    HabitRow,
    | "id"
    | "version"
    | "name"
    | "description"
    | "category"
    | "frequency"
    | "weekdays"
    | "start_on"
    | "end_on"
    | "reminder_time"
  >;
  today: string;
  label?: string;
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md";
}) {
  return (
    <FormDialog
      label={label ?? (habit ? "Edit" : "Add habit")}
      title={habit ? "Edit habit" : "New habit"}
      variant={variant}
      size={size}
    >
      {(close) => (
        <ActionForm
          action={saveHabitAction}
          submitLabel={habit ? "Save habit" : "Add habit"}
          onSuccess={close}
          onCancel={close}
        >
          {(state) => <HabitFields habit={habit} today={today} state={state} />}
        </ActionForm>
      )}
    </FormDialog>
  );
}

function HabitFields({
  habit,
  today,
  state,
}: {
  habit?: Parameters<typeof HabitDialog>[0]["habit"];
  today: string;
  state: { fieldErrors?: Record<string, string>; values?: Record<string, string> };
}) {
  const v = state.values ?? {};
  const [frequency, setFrequency] = useState(v.frequency ?? habit?.frequency ?? "daily");
  return (
    <>
      {habit ? (
        <>
          <input type="hidden" name="id" value={habit.id} />
          <input type="hidden" name="version" value={habit.version} />
        </>
      ) : null}
      <Field id="name" label="Habit" error={state.fieldErrors?.name}>
        {(a) => (
          <Input
            {...a}
            defaultValue={v.name ?? habit?.name}
            maxLength={80}
            placeholder="e.g. Read 20 minutes"
            required
            autoFocus
          />
        )}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="category" label="Type">
          {(a) => (
            <Select {...a} defaultValue={v.category ?? habit?.category ?? "routine"}>
              <option value="routine">Routine</option>
              <option value="health">Health</option>
              <option value="fitness">Fitness</option>
              <option value="sleep">Sleep</option>
              <option value="hydration">Hydration</option>
              <option value="mind">Mind</option>
              <option value="learning">Learning</option>
              <option value="finance">Finance</option>
              <option value="other">Other</option>
            </Select>
          )}
        </Field>
        <Field id="frequency" label="How often">
          {(a) => (
            <Select
              {...a}
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as "daily" | "specific_days")}
            >
              <option value="daily">Every day</option>
              <option value="specific_days">On chosen days</option>
            </Select>
          )}
        </Field>
        <Field id="start_on" label="Starts" error={state.fieldErrors?.start_on}>
          {(a) => (
            <Input
              {...a}
              type="date"
              defaultValue={v.start_on ?? habit?.start_on ?? today}
              required
            />
          )}
        </Field>
        <Field id="end_on" label="Ends (optional)" error={state.fieldErrors?.end_on}>
          {(a) => <Input {...a} type="date" defaultValue={v.end_on ?? habit?.end_on ?? ""} />}
        </Field>
        <Field
          id="reminder_time"
          label="Reminder (optional)"
          hint="Sent by the Nudge Center if you haven't checked in."
          error={state.fieldErrors?.reminder_time}
        >
          {(a) => (
            <Input
              {...a}
              type="time"
              defaultValue={v.reminder_time ?? habit?.reminder_time?.slice(0, 5) ?? ""}
            />
          )}
        </Field>
      </div>
      {frequency === "specific_days" ? (
        <fieldset className="flex flex-wrap gap-3">
          <legend className="text-ink mb-2 text-sm font-medium">On these days</legend>
          {WEEKDAYS.map((d, i) => (
            <label key={d} className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                name={`wd${i}`}
                defaultChecked={habit?.weekdays?.includes(i) ?? false}
              />
              {d}
            </label>
          ))}
          {state.fieldErrors?.weekdays ? (
            <p className="text-danger w-full text-xs">{state.fieldErrors.weekdays}</p>
          ) : null}
        </fieldset>
      ) : null}
      <Field id="description" label="Why it matters (optional)">
        {(a) => (
          <Textarea
            {...a}
            defaultValue={v.description ?? habit?.description ?? ""}
            maxLength={500}
          />
        )}
      </Field>
    </>
  );
}

/**
 * Check in (or undo) for one day through the offline queue. Optimistic: the
 * tick shows straight away and syncs in the background, offline included.
 */
export function HabitCheck({
  userId,
  habitId,
  habitName,
  date,
  checkIn,
  size = "md",
}: {
  userId: string;
  habitId: string;
  habitName: string;
  date: string;
  checkIn: Pick<HabitCheckInRow, "id" | "version" | "status"> | null;
  size?: "sm" | "md";
}) {
  const toast = useToast();
  const [optimistic, setOptimistic] = useState<"done" | "none" | null>(null);
  const done = optimistic ? optimistic === "done" : checkIn?.status === "done";
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={`${habitName} on ${date}: ${done ? "done" : "not done"}`}
      disabled={optimistic !== null}
      onClick={async () => {
        try {
          if (done && checkIn) {
            setOptimistic("none");
            await queueLife(
              userId,
              "habit_check_in",
              "delete",
              {},
              { recordId: checkIn.id, baseVersion: checkIn.version, snapshot: checkIn },
            );
          } else if (!done) {
            setOptimistic("done");
            await queueLife(userId, "habit_check_in", "create", {
              habit_id: habitId,
              on_date: date,
              status: "done",
            });
            toast(`${habitName}: checked in.`, "success");
          }
        } catch {
          setOptimistic(null);
          toast("That couldn't be saved on this device.", "error");
        }
      }}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full border-2 transition-colors",
        size === "md" ? "size-8" : "size-6",
        done ? "border-accent bg-accent text-accent-fg" : "border-line-strong hover:border-accent",
        optimistic !== null && "opacity-70",
      )}
    >
      {done ? (
        <svg
          viewBox="0 0 16 16"
          className={size === "md" ? "size-4" : "size-3.5"}
          aria-hidden="true"
        >
          <path
            d="M3 8.5l3 3 7-7"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      ) : null}
    </button>
  );
}

export function ArchiveHabit({
  habit,
}: {
  habit: Pick<HabitRow, "id" | "version" | "name" | "archived_at">;
}) {
  const archived = habit.archived_at !== null;
  return (
    <InlineAction
      action={archiveHabitAction}
      fields={{ id: habit.id, version: habit.version, archived: archived ? "false" : "true" }}
      label={archived ? "Restore" : "Archive"}
      ariaLabel={`${archived ? "Restore" : "Archive"} ${habit.name}`}
    />
  );
}
