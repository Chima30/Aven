import { SectionNav, type SectionTab } from "@/components/ui/section-nav";

const TABS: SectionTab[] = [
  { href: "/nudges", label: "Inbox", exact: true },
  { href: "/nudges/history", label: "History" },
  { href: "/nudges/pulse", label: "Pulse Check" },
  { href: "/settings/notifications", label: "Preferences" },
];

export function NudgesNav() {
  return <SectionNav label="Nudge Center" tabs={TABS} />;
}
