import type { Metadata } from "next";
import { getAppContext } from "@/lib/auth/session";
import { AppearanceForm } from "./appearance-form";

export const metadata: Metadata = { title: "Appearance" };

export default async function AppearancePage() {
  const { preferences } = await getAppContext();
  return <AppearanceForm theme={preferences.theme} />;
}
