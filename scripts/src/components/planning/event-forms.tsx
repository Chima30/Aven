"use client";

import { useState } from "react";
import {
  cancelOccurrenceAction,
  deleteEventAction,
  saveEventAction,
} from "@/app/(app)/planning/actions";
import { ActionForm } from "@/components/finance/action-form";
import { FormDialog } from "@/components/finance/form-dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { InlineAction } from "@/components/ui/inline-action";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export interface EventEditView {
  id: string;
  version: number;
  title: string;
  description: string | null;
  category: string;
  allDay: boolean;
  date: string;
  endDate: string;
  startTime: string;
  endTime: string;
  recurrence: string | null;
  recurrenceInterval: number;
  recurrenceWeekdays: number[] | null;
  recurrenceUntil: string | null;
  reminderMinutes: number | null;
}

export function EventDialog({
  event,
  defaultDate,
  label,
  variant = "primary",
  size = "md",
  timeZone,
}: {
  event?: EventEditView;
  defaultDate: string;
  label?: string;
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md";
  timeZone: string;
}) {
  return (
    <FormDialog
      label={label ?? (event ? "Edit" : "Add event")}
      title={event ? (event.recurrence ? "Edit event series" : "Edit event") : "New event"}
      description={
        event?.recurrence ? "Changes apply to every occurrence in the series." : undefined
      }
      variant={variant}
      size={size}
    >
      {(close) => (
        <ActionForm
          action={saveEventAction}
          submitLabel={event ? "Save event" : "Add event"}
          onSuccess={close}
          onCancel={close}
        >
          {(state) => (
            <EventFields
              event={event}
              defaultDate={defaultDate}
              state={state}
              timeZone={timeZone}
            />
          )}
        </ActionForm>
      )}
    </FormDialog>
  );
}

function EventFields({
  event,
  defaultDate,
  state,
  timeZone,
}: {
  event?: EventEditView;
  defaultDate: string;
  state: { fieldErrors?: Record<string, string>; values?: Record<string, string> };
  timeZone: string;
}) {
  const v = state.values ?? {};
  const [allDay, setAllDay] = useState(event?.allDay ?? false);
  const [recurrence, setRecurrence] = useState(v.recurrence ?? event?.recurrence ?? "");
  const startDate = v.date ?? event?.date ?? defaultDate;
  return (
    <>
      {event ? (
        <>
          <input type="hidden" name="id" value={event.id} />
          <input type="hidden" name="version" value={event.version} />
        </>
      ) : null}
      <Field id="title" label="Title" error={state.fieldErrors?.title}>
        {(a) => (
          <Input {...a} defaultValue={v.title ?? event?.title} maxLength={200} required autoFocus />
        )}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="category" label="Category">
          {(a) => (
            <Select {...a} defaultValue={v.category ?? event?.category ?? "personal"}>
              <option value="personal">Personal</option>
              <option value="work">Work</option>
              <option value="health">Health</option>
              <option value="finance">Finance</option>
              <option value="social">Social</option>
              <option value="learning">Learning</option>
              <option value="other">Other</option>
            </Select>
          )}
        </Field>
        <label className="text-ink mt-7 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="all_day"
            checked={allDay}
            onChange={(e) => setAllDay(e.target.checked)}
          />
          All day
        </label>
        <Field id="date" label={allDay ? "First day" : "Date"} error={state.fieldErrors?.date}>
          {(a) => <Input {...a} type="date" defaultValue={startDate} required />}
        </Field>
        <Field
          id="end_date"
          label={allDay ? "Last day" : "Ends on (if not the same day)"}
          error={state.fieldErrors?.end_date}
        >
          {(a) => (
            <Input
              {...a}
              type="date"
              defaultValue={
                v.end_date ?? (event && event.endDate !== event.date ? event.endDate : "")
              }
            />
          )}
        </Field>
        {!allDay ? (
          <>
            <Field id="start_time" label="Starts" error={state.fieldErrors?.start_time}>
              {(a) => (
                <Input
                  {...a}
                  type="time"
                  defaultValue={v.start_time ?? event?.startTime ?? "09:00"}
                  required
                />
              )}
            </Field>
            <Field id="end_time" label="Ends" error={state.fieldErrors?.end_time}>
              {(a) => (
                <Input
                  {...a}
                  type="time"
                  defaultValue={v.end_time ?? event?.endTime ?? "10:00"}
                  required
                />
              )}
            </Field>
          </>
        ) : null}
        <Field id="recurrence" label="Repeats">
          {(a) => (
            <Select {...a} value={recurrence} onChange={(e) => setRecurrence(e.target.value)}>
              <option value="">Doesn&apos;t repeat</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly (same date)</option>
              <option value="yearly">Yearly</option>
            </Select>
          )}
        </Field>
        <Field id="reminder" label="Reminder" error={state.fieldErrors?.reminder}>
          {(a) => (
            <Select
              {...a}
              defaultValue={
                v.reminder ?? (event?.reminderMinutes != null ? String(event.reminderMinutes) : "")
              }
            >
              <option value="">None</option>
              <option value="0">At the start</option>
              <option value="5">5 minutes before</option>
              <option value="10">10 minutes before</option>
              <option value="15">15 minutes before</option>
              <option value="30">30 minutes before</option>
              <option value="60">1 hour before</option>
              <option value="120">2 hours before</option>
              <option value="1440">1 day before</option>
            </Select>
          )}
        </Field>
        {recurrence ? (
          <>
            <Field
              id="recurrence_interval"
              label={`Every how many ${recurrence === "daily" ? "days" : recurrence === "weekly" ? "weeks" : recurrence === "monthly" ? "months" : "years"}`}
            >
              {(a) => (
                <Input
                  {...a}
                  type="number"
                  min={1}
                  max={99}
                  defaultValue={v.recurrence_interval ?? event?.recurrenceInterval ?? 1}
                />
              )}
            </Field>
            <Field id="recurrence_until" label="Until (optional)">
              {(a) => (
                <Input
                  {...a}
                  type="date"
                  defaultValue={v.recurrence_until ?? event?.recurrenceUntil ?? ""}
                />
              )}
            </Field>
          </>
        ) : null}
      </div>
      {recurrence === "weekly" ? (
        <fieldset className="flex flex-wrap gap-3">
          <legend className="text-ink mb-2 text-sm font-medium">On these days</legend>
          {WEEKDAYS.map((d, i) => (
            <label key={d} className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                name={`wd${i}`}
                defaultChecked={event?.recurrenceWeekdays?.includes(i) ?? false}
              />
              {d}
            </label>
          ))}
          <p className="text-ink-subtle w-full text-xs">
            Leave all unticked to repeat on the start date&apos;s weekday.
          </p>
        </fieldset>
      ) : null}
      <Field id="description" label="Notes (optional)">
        {(a) => (
          <Textarea
            {...a}
            defaultValue={v.description ?? event?.description ?? ""}
            maxLength={2000}
          />
        )}
      </Field>
      <p className="text-ink-subtle text-xs">Times are in your time zone ({timeZone}).</p>
    </>
  );
}

export function EventActions({
  eventId,
  version,
  occurrenceDate,
  recurring,
  title,
}: {
  eventId: string;
  version: number;
  occurrenceDate: string;
  recurring: boolean;
  title: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {recurring ? (
        <InlineAction
          action={cancelOccurrenceAction}
          fields={{ event_id: eventId, occurrence_date: occurrenceDate }}
          label="Skip this one"
          confirm="Confirm skip"
          ariaLabel={`Remove only this occurrence of ${title}`}
        />
      ) : null}
      <InlineAction
        action={deleteEventAction}
        fields={{ id: eventId, version }}
        label={recurring ? "Delete series" : "Delete"}
        confirm="Confirm delete"
        ariaLabel={`Delete ${recurring ? "every occurrence of " : ""}${title}`}
      />
    </div>
  );
}
