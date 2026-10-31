"use client";

import { SettingsForm } from "@/components/settings/settings-form";
import { Badge } from "@/components/ui/feedback";
import { Switch } from "@/components/ui/switch";
import { updatePrivacyAction } from "../actions";

export function PrivacyForm({
  aiEnabled,
  memoryPaused,
}: {
  aiEnabled: boolean;
  memoryPaused: boolean;
}) {
  return (
    <SettingsForm
      title="Privacy switches"
      description="Master switches that override everything else. They are checked on the server before any AI or memory feature runs."
      action={updatePrivacyAction}
    >
      {() => (
        <div className="flex flex-col gap-6">
          <Switch
            id="aiEnabled"
            label="AI features"
            badge={<Badge>No AI provider in use</Badge>}
            description="When off, AVEN will never send your data to an AI provider — even if you have granted the AI permission below. Off by default."
            defaultChecked={aiEnabled}
          />
          <Switch
            id="memoryPaused"
            label="Pause memory"
            description="When on, AVEN will not create any new long-term memories or recall existing ones, whatever your memory permissions say."
            defaultChecked={memoryPaused}
          />
        </div>
      )}
    </SettingsForm>
  );
}
