import { PublicFooter, PublicHeader } from "@/components/marketing/public-header";
import { ScrollReveal } from "@/components/motion/scroll-reveal";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <PublicHeader />
      <ScrollReveal />
      <main id="main" className="flex-1">
        {children}
      </main>
      <PublicFooter />
    </div>
  );
}
