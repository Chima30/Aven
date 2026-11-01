import type { Metadata } from "next";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { WellbeingPrefsForm } from "@/components/wellbeing/prefs-form";
import { PageHeader } from "@/components/ui/page-header";
import { loadWellbeingBasics } from "@/lib/wellbeing/queries";
import { mlToUnit } from "@/lib/wellbeing/units";

export const metadata: Metadata = { title: "Wellbeing settings" };

export default async function WellbeingSettingsPage() {
  const { prefs } = await loadWellbeingBasics();
  return (
    <>
      <PageHeader
        title="Wellbeing settings"
        description="Units and targets. Your logs are always stored in standard units, so changing these never changes your records."
      />
      <Card className="max-w-xl">
        <CardHeader title="Units and targets" />
        <CardBody>
          <WellbeingPrefsForm
            values={{
              water_unit: prefs.water_unit,
              water_target: String(
                Math.round(mlToUnit(prefs.water_target_ml, prefs.water_unit) * 100) / 100,
              ),
              distance_unit: prefs.distance_unit,
              sleep_target_hours: String(prefs.sleep_target_minutes / 60),
            }}
          />
        </CardBody>
      </Card>
    </>
  );
}
