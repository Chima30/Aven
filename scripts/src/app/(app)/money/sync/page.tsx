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
        eyebrow="Money"
        title="Sync"
        description="Transactions are saved on this device first and then sent to your account. Here you can see what has reached the server — and decide what to do if something couldn't."
      />
      <SyncCenter
        userId={user.id}
        accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
        locale={regional.locale}
      />
    </div>
  );
}
