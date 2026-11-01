import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";
import { publicEnv } from "@/lib/env";
import { emailConfig, type EmailConfig } from "@/lib/integrations/config";
import type { Database } from "@/lib/supabase/database.types";
import {
  EMAIL_WINDOW_MS,
  MAX_EMAIL_ATTEMPTS,
  buildNudgeEmail,
  qualifiesForEmail,
  type EmailMode,
} from "./email-content";

type Admin = SupabaseClient<Database>;

export type EmailOutcome = "sent" | "nothing" | "not_configured" | "no_address" | "failed";

/** Sends one SMTP message. Injected in tests. */
export type MailSender = (
  config: EmailConfig,
  message: { to: string; subject: string; text: string; html: string; settingsUrl: string },
) => Promise<void>;

export const smtpSender: MailSender = async (config, m) => {
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    requireTLS: !config.secure,
    auth: { user: config.user, pass: config.password },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  await transport.sendMail({
    from: config.from,
    to: m.to,
    subject: m.subject,
    text: m.text,
    html: m.html,
    headers: { "List-Unsubscribe": `<${m.settingsUrl}>` },
  });
};

/**
 * Emails a user's newly delivered nudges — only when they turned email on.
 * One email per run, never the same nudge twice: rows are claimed (emailed_at
 * set) before sending and released again if sending fails (max 3 attempts).
 */
export async function sendNudgeEmails(
  admin: Admin,
  userId: string,
  prefs: { email_enabled: boolean; email_mode: EmailMode },
  now: Date,
  send: MailSender = smtpSender,
): Promise<EmailOutcome> {
  if (!prefs.email_enabled) return "nothing";
  const config = emailConfig();
  if (config.status !== "configured") return "not_configured";

  const since = new Date(now.getTime() - EMAIL_WINDOW_MS).toISOString();
  const { data: rows, error } = await admin
    .from("notifications")
    .select(
      "id, kind, category, priority, title, body, action_url, status, read_at, dismissed_at, emailed_at, email_attempts, delivered_at",
    )
    .eq("user_id", userId)
    .eq("status", "delivered")
    .is("emailed_at", null)
    .lt("email_attempts", MAX_EMAIL_ATTEMPTS)
    .gte("delivered_at", since)
    .order("delivered_at", { ascending: true })
    .limit(50);
  if (error) throw new Error(`email candidates: ${error.message}`);
  const candidates = (rows ?? []).filter((n) => qualifiesForEmail(n, prefs.email_mode, now));
  if (candidates.length === 0) return "nothing";

  // Claim atomically: an overlapping run can't claim the same rows.
  const { data: claimed } = await admin
    .from("notifications")
    .update({ emailed_at: now.toISOString() })
    .eq("user_id", userId)
    .in(
      "id",
      candidates.map((c) => c.id),
    )
    .is("emailed_at", null)
    .select("id");
  const claimedIds = new Set((claimed ?? []).map((r) => r.id));
  const items = candidates.filter((c) => claimedIds.has(c.id));
  if (items.length === 0) return "nothing";

  const release = async () => {
    for (const item of items) {
      await admin
        .from("notifications")
        .update({ emailed_at: null, email_attempts: item.email_attempts + 1 })
        .eq("id", item.id)
        .eq("user_id", userId);
    }
  };

  const [{ data: authUser }, { data: profile }] = await Promise.all([
    admin.auth.admin.getUserById(userId),
    admin.from("profiles").select("display_name").eq("id", userId).maybeSingle(),
  ]);
  const address = authUser?.user?.email;
  if (!address || !authUser?.user?.email_confirmed_at) {
    await release();
    return "no_address";
  }

  const siteUrl = publicEnv().NEXT_PUBLIC_SITE_URL;
  const email = buildNudgeEmail({
    name: profile?.display_name ?? address.split("@")[0] ?? "there",
    siteUrl,
    items,
  });
  try {
    await send(config.config, {
      to: address,
      ...email,
      settingsUrl: `${siteUrl}/settings/notifications`,
    });
    return "sent";
  } catch (error) {
    // Never log the address or SMTP credentials.
    console.error("[nudges] email failed:", error instanceof Error ? error.name : "error");
    await release();
    return "failed";
  }
}
