/**
 * App navigation. Sections that are not built yet are listed with the stage
 * they arrive in and rendered as non-clickable labels — never as links to
 * empty pages.
 */
export type NavIcon =
  "overview" | "money" | "wellbeing" | "planning" | "intelligence" | "nudges" | "settings";

export interface NavItem {
  label: string;
  icon: NavIcon;
  href?: string;
  /** Present when the section is not available yet. */
  comingInStage?: number;
  children?: string[];
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Overview", icon: "overview", href: "/overview" },
  {
    label: "Money",
    icon: "money",
    comingInStage: 2,
    children: [
      "Accounts",
      "Transactions",
      "Budgets",
      "Savings",
      "Shared expenses",
      "Subscriptions",
    ],
  },
  {
    label: "Planning",
    icon: "planning",
    comingInStage: 3,
    children: ["Calendar", "Tasks", "Reminders", "Reviews"],
  },
  {
    label: "Nudge Center",
    icon: "nudges",
    comingInStage: 3,
    children: ["Pulse Check", "Notifications"],
  },
  {
    label: "Wellbeing",
    icon: "wellbeing",
    comingInStage: 5,
    children: ["Sleep", "Water", "Meals", "Exercise", "Habits", "Routines"],
  },
  {
    label: "Intelligence",
    icon: "intelligence",
    comingInStage: 6,
    children: ["Ask Your Agent", "Memory", "Insights"],
  },
  { label: "Settings", icon: "settings", href: "/settings" },
];
