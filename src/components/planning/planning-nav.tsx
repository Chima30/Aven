import { SectionNav, type SectionTab } from "@/components/ui/section-nav";

const TABS: SectionTab[] = [
  { href: "/planning", label: "Today", exact: true },
  { href: "/planning/calendar", label: "Calendar" },
  { href: "/planning/tasks", label: "Tasks" },
  { href: "/planning/habits", label: "Habits" },
  { href: "/planning/reviews", label: "Reviews" },
];

export function PlanningNav() {
  return <SectionNav label="Planning" tabs={TABS} />;
}
