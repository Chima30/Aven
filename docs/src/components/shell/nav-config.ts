/**
 * App navigation. Sections that are not built yet are listed as non-clickable
 * labels marked "Later" — never as links to empty pages.
 */
export type NavIcon =
  "overview" | "money" | "wellbeing" | "planning" | "intelligence" | "nudges" | "settings";

export interface NavItem {
  label: string;
  icon: NavIcon;
  href?: string;
  /** Present when the section is not available yet. */
  comingLater?: true;
  children?: string[];
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Overview", icon: "overview", href: "/overview" },
  { label: "Money", icon: "money", href: "/money" },
  { label: "Intelligence", icon: "intelligence", href: "/intelligence" },
  {
    label: "Planning",
    icon: "planning",
    comingLater: true,
    children: ["Calendar", "Tasks", "Reminders", "Reviews"],
  },
  {
    label: "Nudge Center",
    icon: "nudges",
    comingLater: true,
    children: ["Pulse Check", "Notifications"],
  },
  {
    label: "Wellbeing",
    icon: "wellbeing",
    comingLater: true,
    children: ["Sleep", "Water", "Meals", "Exercise", "Habits", "Routines"],
  },
  { label: "Settings", icon: "settings", href: "/settings" },
];
