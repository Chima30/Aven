import { IntelligenceNav } from "@/components/intelligence/intelligence-nav";

export default function IntelligenceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-8">
      <IntelligenceNav />
      {children}
    </div>
  );
}
