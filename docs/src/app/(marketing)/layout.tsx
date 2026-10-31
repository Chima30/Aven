import { PublicFooter, PublicHeader } from "@/components/marketing/public-header";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <PublicHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <PublicFooter />
    </div>
  );
}
