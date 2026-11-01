import type { Metadata } from "next";
import { NotificationItem } from "@/components/nudges/notification-item";
import { EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { dayLabel, loadPlanningBasics, timeIn } from "@/lib/planning/queries";
import { localDate } from "@/lib/time/zoned";

export const metadata: Metadata = { title: "Nudge history" };

export default async function NudgeHistory() {
  const { supabase, timeZone, locale } = await loadPlanningBasics();
  const { data } = await supabase
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  const items = data ?? [];
  return (
    <>
      <PageHeader
        title="History"
        description="Everything the rules produced in the last while — including nudges held for quiet hours, bundled into a summary, or not shown because of your settings, with the reason."
      />
      {items.length === 0 ? (
        <EmptyState
          title="No history yet"
          description="Nudges appear once you add tasks with reminders, events, habits, budgets or goals."
        />
      ) : (
        <ul className="divide-line divide-y" aria-label="Notification history">
          {items.map((n) => {
            const d = new Date(n.created_at);
            return (
              <NotificationItem
                key={n.id}
                n={n}
                mode="history"
                when={`${dayLabel(localDate(d, timeZone), locale)}, ${timeIn(d, timeZone, locale)}`}
              />
            );
          })}
        </ul>
      )}
    </>
  );
}
