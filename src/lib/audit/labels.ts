/** Human-readable descriptions of audit log actions. */
const LABELS: Record<string, string> = {
  "account.created": "Account created",
  "auth.signed_in": "Signed in",
  "auth.signed_out": "Signed out",
  "auth.signed_out_everywhere": "Signed out on every device",
  "auth.password_changed": "Password changed",
  "auth.password_reset_completed": "Password reset",
  "auth.email_confirmed": "Email confirmed",
  "consent.granted": "Permission granted",
  "consent.withdrawn": "Permission withdrawn",
  "privacy.ai_preference_changed": "AI features setting changed",
  "privacy.memory_pause_changed": "Memory pause setting changed",
  "data.exported": "Data exported",
};

export function auditLabel(action: string, metadata: Record<string, unknown> = {}): string {
  const base = LABELS[action] ?? action;
  if (action === "privacy.ai_preference_changed") {
    return metadata.ai_enabled ? "AI features switched on" : "AI features switched off";
  }
  if (
    (action === "consent.granted" || action === "consent.withdrawn") &&
    typeof metadata.category === "string"
  ) {
    return `${base}: ${metadata.category.replace(/_/g, " ")}`;
  }
  return base;
}
