import { SectionNav, type SectionTab } from "@/components/ui/section-nav";

const TABS: SectionTab[] = [
  { href: "/wellbeing", label: "Overview", exact: true },
  { href: "/wellbeing/sleep", label: "Sleep" },
  { href: "/wellbeing/water", label: "Water" },
  { href: "/wellbeing/meals", label: "Meals" },
  { href: "/wellbeing/activity", label: "Activity" },
  { href: "/wellbeing/mood", label: "Mood" },
  { href: "/wellbeing/settings", label: "Settings" },
];

export function WellbeingNav() {
  return <SectionNav label="Wellbeing" tabs={TABS} />;
}
