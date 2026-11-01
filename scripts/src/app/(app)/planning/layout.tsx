import { PlanningNav } from "@/components/planning/planning-nav";

export default function PlanningLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-8">
      <PlanningNav />
      {children}
    </div>
  );
}
