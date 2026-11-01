import type { Metadata } from "next";
import Link from "next/link";
import { CategoryForm, TaskCheck, TaskDialog, TaskMenu } from "@/components/planning/task-forms";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/cn";
import { dayLabel, loadPlanningBasics, loadTasks, TASK_STATUS_LABEL } from "@/lib/planning/queries";
import type { TaskRow } from "@/lib/supabase/database.types";
import { addDays, localDate, localMinutes, minutesToTime } from "@/lib/time/zoned";

export const metadata: Metadata = { title: "Tasks" };

const VIEWS = [
  { key: "open", label: "To do" },
  { key: "today", label: "Today" },
  { key: "upcoming", label: "Upcoming" },
  { key: "overdue", label: "Overdue" },
  { key: "completed", label: "Completed" },
  { key: "all", label: "All" },
] as const;
type View = (typeof VIEWS)[number]["key"];

const PRIORITY_TONE = { high: "danger", medium: "neutral", low: "info" } as const;

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const view: View = VIEWS.some((v) => v.key === params.view) ? (params.view as View) : "open";
  const category = typeof params.category === "string" ? params.category : "";
  const { user, today, timeZone, locale } = await loadPlanningBasics();
  const { tasks, categories } = await loadTasks();
  const activeCategories = categories.filter((c) => !c.archived_at);
  const catName = new Map(categories.map((c) => [c.id, c.name]));
  const open = (t: TaskRow) => t.status === "not_started" || t.status === "in_progress";

  const filtered = tasks.filter((t) => {
    if (category && t.category_id !== category) return false;
    switch (view) {
      case "open":
        return open(t);
      case "today":
        return open(t) && t.due_on === today;
      case "upcoming":
        return open(t) && !!t.due_on && t.due_on > today && t.due_on <= addDays(today, 14);
      case "overdue":
        return open(t) && !!t.due_on && t.due_on < today;
      case "completed":
        return t.status === "completed";
      default:
        return true;
    }
  });
  const counts = {
    overdue: tasks.filter((t) => open(t) && t.due_on && t.due_on < today).length,
    today: tasks.filter((t) => open(t) && t.due_on === today).length,
  };
  const href = (v: string, c = category) => `/planning/tasks?view=${v}${c ? `&category=${c}` : ""}`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Planning"
        title="Tasks"
        description="Everything you need to do, with due dates and reminders in your time zone. Ticking a task works offline too."
        action={
          <TaskDialog
            categories={activeCategories}
            today={today}
            defaultOpen={params.new === "1"}
          />
        }
      />

      <div className="flex flex-wrap items-center gap-2" role="navigation" aria-label="Task views">
        {VIEWS.map((v) => (
          <Link
            key={v.key}
            href={href(v.key)}
            aria-current={view === v.key ? "page" : undefined}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm",
              view === v.key
                ? "border-accent bg-accent-soft text-ink font-medium"
                : "border-line text-ink-muted hover:text-ink",
            )}
          >
            {v.label}
            {v.key === "overdue" && counts.overdue > 0 ? ` (${counts.overdue})` : ""}
            {v.key === "today" && counts.today > 0 ? ` (${counts.today})` : ""}
          </Link>
        ))}
        {activeCategories.length > 0 ? (
          <span className="text-ink-subtle ml-auto flex flex-wrap items-center gap-1 text-xs">
            Category:
            <Link
              href={href(view, "")}
              className={cn("rounded px-1.5 py-0.5", !category && "bg-surface-muted text-ink")}
            >
              All
            </Link>
            {activeCategories.map((c) => (
              <Link
                key={c.id}
                href={href(view, c.id)}
                className={cn(
                  "rounded px-1.5 py-0.5",
                  category === c.id && "bg-surface-muted text-ink",
                )}
              >
                {c.name}
              </Link>
            ))}
          </span>
        ) : null}
      </div>

      <Card>
        <CardBody>
          {filtered.length === 0 ? (
            <EmptyState
              title={tasks.length === 0 ? "No tasks yet" : "Nothing here"}
              description={
                tasks.length === 0
                  ? "Add the first thing you want to get done. You can give it a due date and a reminder."
                  : view === "overdue"
                    ? "Nothing is overdue."
                    : "No tasks match this view."
              }
            />
          ) : (
            <ul className="divide-line divide-y" data-testid="task-list">
              {filtered.map((t) => {
                const remind = t.remind_at ? new Date(t.remind_at) : null;
                return (
                  <li key={t.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="pt-0.5">
                      {t.status === "cancelled" ? (
                        <span
                          className="border-line-strong block size-6 rounded-full border-2 border-dashed"
                          aria-hidden="true"
                        />
                      ) : (
                        <TaskCheck userId={user.id} task={t} />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            "text-ink text-sm font-medium",
                            t.status === "completed" && "text-ink-muted line-through",
                            t.status === "cancelled" && "text-ink-subtle line-through",
                          )}
                        >
                          {t.title}
                        </span>
                        <Badge tone={PRIORITY_TONE[t.priority]}>{t.priority}</Badge>
                        {t.status === "in_progress" || t.status === "cancelled" ? (
                          <Badge>{TASK_STATUS_LABEL[t.status]}</Badge>
                        ) : null}
                        {t.category_id && catName.get(t.category_id) ? (
                          <Badge tone="accent">{catName.get(t.category_id)}</Badge>
                        ) : null}
                      </div>
                      <p className="text-ink-muted mt-0.5 text-xs">
                        {t.due_on ? (
                          <span
                            className={cn(open(t) && t.due_on < today && "text-danger font-medium")}
                          >
                            {t.due_on < today && open(t) ? "Overdue · " : ""}Due{" "}
                            {t.due_on === today ? "today" : dayLabel(t.due_on, locale)}
                            {t.due_time ? ` at ${t.due_time.slice(0, 5)}` : ""}
                          </span>
                        ) : (
                          "No due date"
                        )}
                        {remind
                          ? ` · Reminder ${localDate(remind, timeZone) === today ? "today" : dayLabel(localDate(remind, timeZone), locale)} ${minutesToTime(localMinutes(remind, timeZone))}`
                          : ""}
                      </p>
                      {t.description ? (
                        <p className="text-ink-muted mt-1 text-sm whitespace-pre-line">
                          {t.description}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                      <TaskDialog
                        task={{
                          ...t,
                          remindOn: remind ? localDate(remind, timeZone) : null,
                          remindTime: remind ? minutesToTime(localMinutes(remind, timeZone)) : null,
                        }}
                        categories={activeCategories}
                        today={today}
                        variant="ghost"
                      />
                      <TaskMenu task={t} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Categories" description="Group tasks however suits you." />
        <CardBody className="flex flex-col gap-4">
          {activeCategories.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {activeCategories.map((c) => (
                <li key={c.id}>
                  <Badge tone="accent">{c.name}</Badge>
                </li>
              ))}
            </ul>
          ) : null}
          <CategoryForm />
        </CardBody>
      </Card>
    </div>
  );
}
