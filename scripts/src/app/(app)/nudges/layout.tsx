import { NudgesNav } from "@/components/nudges/nudges-nav";

export default function NudgesLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-8">
      <NudgesNav />
      {children}
    </div>
  );
}
