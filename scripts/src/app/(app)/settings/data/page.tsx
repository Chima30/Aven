import type { Metadata } from "next";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/feedback";
import { getAppContext } from "@/lib/auth/session";
import { formatDateTime, formatNumber } from "@/lib/regional/format";
import { createClient } from "@/lib/supabase/server";
import { DeleteAccount } from "./delete-account";
import { ExportButton } from "./export-button";

export const metadata: Metadata = { title: "Your data" };

export default async function DataPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const { preferences } = await getAppContext();
  const supabase = await createClient();
  const { data: exports } = await supabase
    .from("data_export_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(5);
  const regional = {
    locale: preferences.locale,
    timeZone: preferences.time_zone,
    dateFormat: preferences.date_format,
    numberFormat: preferences.number_format,
  };

  return (
    <>
      {params.export === "rate_limited" ? (
        <Alert tone="danger">
          You&apos;ve requested several exports recently. Please wait an hour.
        </Alert>
      ) : null}
      {params.export === "failed" ? (
        <Alert tone="danger">The export couldn&apos;t be created. Please try again.</Alert>
      ) : null}

      <Card>
        <CardHeader
          title="Export your data"
          description="Download everything AVEN stores about you as a JSON file. It's generated on demand and never stored on our servers."
        />
        <CardBody>
          <ExportButton />
          {exports && exports.length > 0 ? (
            <div className="mt-6">
              <h3 className="type-label text-ink-muted">Recent exports</h3>
              <ul className="divide-line mt-2 divide-y text-sm">
                {exports.map((e) => (
                  <li key={e.id} className="flex justify-between gap-4 py-2">
                    <span className="text-ink">
                      {formatDateTime(new Date(e.created_at), regional)}
                    </span>
                    <span className="text-ink-muted">
                      {e.format.toUpperCase()} ·{" "}
                      {formatNumber(Math.max(1, Math.round(e.byte_size / 1024)), regional)} KB
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardBody>
      </Card>

      <DeleteAccount />
    </>
  );
}
