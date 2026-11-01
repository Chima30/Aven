"use client";

import { useState } from "react";
import {
  deleteTaskAction,
  saveTaskAction,
  saveTaskCategoryAction,
  setTaskStatusAction,
} from "@/app/(app)/planning/actions";
import { ActionForm } from "@/components/finance/action-form";
import { FormDialog } from "@/components/finance/form-dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { InlineAction } from "@/components/ui/inline-action";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { queueLife } from "@/lib/life/queue";
import type { TaskCategoryRow, TaskRow } from "@/lib/supabase/database.types";

export interface TaskEditView extends Pick<
  TaskRow,
  | "id"
  | "title"
  | "description"
  | "status"
  | "priority"
  | "category_id"
  | "due_on"
  | "due_time"
  | "version"
> {
  remindOn: string | null;
  remindTime: string | null;
}

export function TaskDialog({
  task,
  categories,
  today,
  label,
  variant = "primary",
  defaultOpen,
}: {
  task?: TaskEditView;
  categories: Pick<TaskCategoryRow, "id" | "name">[];
  today: string;
  label?: string;
  variant?: "primary" | "secondary" | "ghost";
  defaultOpen?: boolean;
}) {
  return (
    <FormDialog
      label={label ?? (task ? "Edit" : "Add task")}
      title={task ? "Edit task" : "New task"}
      variant={variant}
      size={task ? "sm" : "md"}
      defaultOpen={defaultOpen}
    >
      {(close) => (
        <ActionForm
          action={saveTaskAction}
          submitLabel={task ? "Save task" : "Add task"}
          onSuccess={close}
          onCancel={close}
        >
          {(state) => {
            const v = state.values ?? {};
            return (
              <>
                {task ? (
                  <>
                    <input type="hidden" name="id" value={task.id} />
                    <input type="hidden" name="version" value={task.version} />
                  </>
                ) : null}
                <Field id="title" label="Task" error={state.fieldErrors?.title}>
                  {(a) => (
                    <Input
                      {...a}
                      defaultValue={v.title ?? task?.title}
                      maxLength={200}
                      required
                      autoFocus
                    />
                  )}
                </Field>
                <Field
                  id="description"
                  label="Notes (optional)"
                  error={state.fieldErrors?.description}
                >
                  {(a) => (
                    <Textarea
                      {...a}
                      defaultValue={v.description ?? task?.description ?? ""}
                      maxLength={2000}
                    />
                  )}
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field id="priority" label="Priority">
                    {(a) => (
                      <Select {...a} defaultValue={v.priority ?? task?.priority ?? "medium"}>
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </Select>
                    )}
                  </Field>
                  {task ? (
                    <Field id="status" label="Status">
                      {(a) => (
                        <Select {...a} defaultValue={v.status ?? task.status}>
                          <option value="not_started">Not started</option>
                          <option value="in_progress">In progress</option>
                          <option value="completed">Completed</option>
                          <option value="cancelled">Cancelled</option>
                        </Select>
                      )}
                    </Field>
                  ) : (
                    <Field id="category_id" label="Category">
                      {(a) => (
                        <Select {...a} defaultValue={v.category_id ?? ""}>
                          <option value="">None</option>
                          {categories.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </Select>
                      )}
                    </Field>
                  )}
                  {task ? (
                    <Field id="category_id" label="Category">
                      {(a) => (
                        <Select {...a} defaultValue={v.category_id ?? task.category_id ?? ""}>
                          <option value="">None</option>
                          {categories.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </Select>
                      )}
                    </Field>
                  ) : null}
                  <Field id="due_on" label="Due date (optional)" error={state.fieldErrors?.due_on}>
                    {(a) => (
                      <Input
                        {...a}
                        type="date"
                        defaultValue={v.due_on ?? task?.due_on ?? ""}
                        min={task ? undefined : undefined}
                      />
                    )}
                  </Field>
                  <Field
                    id="due_time"
                    label="Due time (optional)"
                    error={state.fieldErrors?.due_time}
                  >
                    {(a) => (
                      <Input
                        {...a}
                        type="time"
                        defaultValue={v.due_time ?? task?.due_time?.slice(0, 5) ?? ""}
                      />
                    )}
                  </Field>
                  <Field
                    id="remind_on"
                    label="Remind me on"
                    hint="Leave empty for no reminder."
                    error={state.fieldErrors?.remind_on}
                  >
                    {(a) => (
                      <Input
                        {...a}
                        type="date"
                        defaultValue={v.remind_on ?? task?.remindOn ?? ""}
                      />
                    )}
                  </Field>
                  <Field
                    id="remind_time"
                    label="Reminder time"
                    error={state.fieldErrors?.remind_time}
                  >
                    {(a) => (
                      <Input
                        {...a}
                        type="time"
                        defaultValue={v.remind_time ?? task?.remindTime ?? ""}
                      />
                    )}
                  </Field>
                </div>
                <p className="text-ink-subtle text-xs">
                  Dates and times use your time zone. Today is {today}.
                </p>
              </>
            );
          }}
        </ActionForm>
      )}
    </FormDialog>
  );
}

/**
 * Tick a task done (or undo) through the offline queue, so it works with no
 * connection and syncs exactly once. Shows the change straight away.
 */
export function TaskCheck({
  userId,
  task,
}: {
  userId: string;
  task: Pick<TaskRow, "id" | "title" | "status" | "version">;
}) {
  const toast = useToast();
  const [optimistic, setOptimistic] = useState<TaskRow["status"] | null>(null);
  const status = optimistic ?? task.status;
  const done = status === "completed";
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={`${done ? "Mark not done" : "Mark done"}: ${task.title}`}
      disabled={optimistic !== null}
      onClick={async () => {
        const next = done ? "not_started" : "completed";
        setOptimistic(next);
        try {
          await queueLife(
            userId,
            "task",
            "update",
            { status: next },
            { recordId: task.id, baseVersion: task.version, snapshot: task },
          );
          toast(done ? "Marked not done." : "Done — nice work.", "success");
        } catch {
          setOptimistic(null);
          toast("That couldn't be saved on this device.", "error");
        }
      }}
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
        done ? "border-accent bg-accent text-accent-fg" : "border-line-strong hover:border-accent",
        optimistic !== null && "opacity-70",
      )}
    >
      {done ? (
        <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden="true">
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

export function TaskMenu({ task }: { task: Pick<TaskRow, "id" | "status" | "version" | "title"> }) {
  return (
    <div className="flex items-center gap-1">
      {task.status === "not_started" ? (
        <InlineAction
          action={setTaskStatusAction}
          fields={{ id: task.id, version: task.version, status: "in_progress" }}
          label="Start"
          ariaLabel={`Start: ${task.title}`}
        />
      ) : null}
      {task.status !== "cancelled" && task.status !== "completed" ? (
        <InlineAction
          action={setTaskStatusAction}
          fields={{ id: task.id, version: task.version, status: "cancelled" }}
          label="Cancel"
          ariaLabel={`Cancel task: ${task.title}`}
        />
      ) : null}
      <InlineAction
        action={deleteTaskAction}
        fields={{ id: task.id, version: task.version }}
        label="Delete"
        confirm="Confirm delete"
        ariaLabel={`Delete task: ${task.title}`}
      />
    </div>
  );
}

export function CategoryForm() {
  return (
    <ActionForm
      action={saveTaskCategoryAction}
      submitLabel="Add category"
      className="flex flex-col gap-3"
    >
      {(state) => (
        <Field id="name" label="New category" error={state.fieldErrors?.name}>
          {(a) => (
            <Input
              {...a}
              maxLength={40}
              placeholder="e.g. Work, Home, Study"
              defaultValue={state.status === "error" ? state.values?.name : ""}
            />
          )}
        </Field>
      )}
    </ActionForm>
  );
}
