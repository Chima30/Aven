import { SectionNav, type SectionTab } from "@/components/ui/section-nav";

const TABS: SectionTab[] = [
  { href: "/intelligence", label: "Insights & recommendations", exact: true },
  { href: "/intelligence/memory", label: "Walrus Memory" },
];

export function IntelligenceNav() {
  return <SectionNav label="Intelligence" tabs={TABS} />;
}
