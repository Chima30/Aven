import Link from "next/link";
import { Alert } from "@/components/ui/feedback";

export function WellbeingConsentNotice() {
  return (
    <Alert tone="info" title="Wellbeing logging is off">
      To log sleep, water, meals, activity or mood, allow “Store wellbeing information” in{" "}
      <Link href="/settings/privacy" className="underline">
        Settings → Privacy
      </Link>
      . Only you can see these logs, and you can withdraw at any time. AVEN is not a medical
      service.
    </Alert>
  );
}

export function NotMedicalNote() {
  return (
    <p className="text-ink-subtle text-xs">
      AVEN helps you notice your own patterns. It isn&apos;t a medical service and doesn&apos;t
      diagnose. If you&apos;re worried about your health, talk to a qualified professional.
    </p>
  );
}
