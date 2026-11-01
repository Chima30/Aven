import Link from "next/link";
import { markNotificationAction } from "@/app/(app)/nudges/actions";
import { Badge } from "@/components/ui/feedback";
import { InlineAction } from "@/components/ui/inline-action";
import { cn } from "@/lib/cn";
import { CATEGORY_LABEL, decisionLabel } from "@/lib/nudges/labels";
import type { NotificationRow } from "@/lib/supabase/database.types";

export function NotificationItem({
  n,
  when,
  mode = "inbox",
}: {
  n: NotificationRow;
  when: string;
  mode?: "inbox" | "history";
}) {
  const unread = n.status === "delivered" && !n.read_at && !n.dismissed_at;
  const held = decisionLabel(n);
  return (
    <li
      className={cn(
        "flex items-start justify-between gap-3 px-1 py-3",
        unread && "bg-accent/5 -mx-1 rounded-lg px-2",
      )}
      data-testid="notification"
      data-unread={unread ? "true" : "false"}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          {unread ? <span className="bg-accent size-2 rounded-full" aria-label="Unread" /> : null}
          <p className={cn("text-ink text-sm", unread && "font-semibold")}>{n.title}</p>
          <Badge tone={n.priority === "high" ? "warning" : "neutral"}>
            {CATEGORY_LABEL[n.category]}
          </Badge>
          {n.priority === "high" ? <Badge tone="warning">Important</Badge> : null}
        </div>
        {n.body ? (
          <p className="text-ink-muted mt-0.5 text-sm whitespace-pre-line">{n.body}</p>
        ) : null}
        <p className="text-ink-subtle mt-1 text-xs">
          {when}
          {held ? ` · ${held}` : ""}
          {n.dismissed_at ? " · Dismissed" : ""}
        </p>
        {n.action_url ? (
          <Link href={n.action_url} className="text-accent mt-1 inline-block text-xs underline">
            Open
          </Link>
        ) : null}
      </div>
      {n.status === "delivered" ? (
        <div className="flex shrink-0 gap-1">
          {mode === "inbox" ? (
            <>
              <InlineAction
                action={markNotificationAction}
                fields={{ id: n.id, op: n.read_at ? "unread" : "read" }}
                label={n.read_at ? "Mark unread" : "Mark read"}
                ariaLabel={`${n.read_at ? "Mark unread" : "Mark read"}: ${n.title}`}
              />
              <InlineAction
                action={markNotificationAction}
                fields={{ id: n.id, op: "dismiss" }}
                label="Dismiss"
                ariaLabel={`Dismiss: ${n.title}`}
              />
            </>
          ) : n.dismissed_at ? (
            <InlineAction
              action={markNotificationAction}
              fields={{ id: n.id, op: "restore" }}
              label="Restore"
              ariaLabel={`Restore: ${n.title}`}
            />
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
