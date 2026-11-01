import { AppShell } from "@/components/shell/app-shell";
import { getAppContext } from "@/lib/auth/session";

/**
 * Every page in this group requires a verified session (checked here on the
 * server, in addition to the optimistic redirect in proxy.ts).
 */
export default async function SignedInLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, preferences } = await getAppContext();
  return (
    <AppShell
      userId={user.id}
      displayName={profile.display_name ?? user.email?.split("@")[0] ?? "You"}
      theme={preferences.theme}
    >
      {children}
    </AppShell>
  );
}
