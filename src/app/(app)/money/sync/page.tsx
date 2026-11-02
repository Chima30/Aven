import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { loadFinanceBasics } from "@/lib/finance/queries";
import { SyncCenter } from "./sync-center";

export const metadata: Metadata = { title: "Sync" };

export default async function SyncPage() {
  const { user, accounts, regional } = await loadFinanceBasics();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Sync"
        description="What's on this device and what has reached your account"
      />
      <SyncCenter
        userId={user.id}
        accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
        locale={regional.locale}
      />
    </div>
  );
}
