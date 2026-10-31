import type { Metadata } from "next";
import { getAppContext } from "@/lib/auth/session";
import { countryOptions } from "@/lib/regional/options";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Profile settings" };

export default async function ProfileSettingsPage() {
  const { user, profile } = await getAppContext();
  return (
    <ProfileForm
      displayName={profile.display_name ?? ""}
      countryCode={profile.country_code ?? ""}
      email={user.email ?? ""}
      countries={countryOptions()}
    />
  );
}
