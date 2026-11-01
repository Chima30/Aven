import type { NotificationRow } from "@/lib/supabase/database.types";
import { CATEGORY_LABEL } from "./labels";

/**
 * Pure helpers for email notifications: which nudges qualify, and the email
 * itself. Email only ever repeats what is already in the user's Nudge Center
 * inbox — it never creates new content.
 */

export type EmailMode = "summaries" | "all";

export type EmailCandidate = Pick<
  NotificationRow,
  | "id"
  | "kind"
  | "category"
  | "priority"
  | "title"
  | "body"
  | "action_url"
  | "status"
  | "read_at"
  | "dismissed_at"
  | "emailed_at"
  | "email_attempts"
  | "delivered_at"
>;

/** Only nudges delivered within this window are emailed (no surprise backlog). */
export const EMAIL_WINDOW_MS = 3 * 60 * 60 * 1000;
export const MAX_EMAIL_ATTEMPTS = 3;
export const MAX_ITEMS_PER_EMAIL = 10;

export function qualifiesForEmail(n: EmailCandidate, mode: EmailMode, now: Date): boolean {
  if (n.status !== "delivered" || n.emailed_at || n.read_at || n.dismissed_at) return false;
  if (n.email_attempts >= MAX_EMAIL_ATTEMPTS) return false;
  if (!n.delivered_at || now.getTime() - Date.parse(n.delivered_at) > EMAIL_WINDOW_MS) return false;
  if (mode === "all") return true;
  return (
    n.kind === "daily_summary" ||
    n.kind === "weekly_summary" ||
    n.priority === "high" ||
    n.category === "account_security"
  );
}

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** Only AVEN's own internal paths are turned into links. */
function linkFor(siteUrl: string, actionUrl: string | null): string | null {
  if (!actionUrl || !/^\/[A-Za-z0-9/_?=&.%-]*$/.test(actionUrl) || actionUrl.startsWith("//")) {
    return null;
  }
  return `${siteUrl}${actionUrl}`;
}

export interface BuiltEmail {
  subject: string;
  text: string;
  html: string;
}

export function buildNudgeEmail(input: {
  name: string;
  siteUrl: string;
  items: EmailCandidate[];
}): BuiltEmail {
  const items = input.items.slice(0, MAX_ITEMS_PER_EMAIL);
  const extra = input.items.length - items.length;
  const single = items.length === 1 ? items[0]! : null;
  const subject = (
    single
      ? single.title
      : `${items.length} updates from AVEN${items.some((i) => i.priority === "high") ? " (1+ important)" : ""}`
  )
    .replace(/[\r\n]+/g, " ")
    .slice(0, 120);
  const settingsUrl = `${input.siteUrl}/settings/notifications`;
  const inboxUrl = `${input.siteUrl}/nudges`;

  const text = [
    `Hi ${input.name},`,
    "",
    ...items.flatMap((i) => {
      const link = linkFor(input.siteUrl, i.action_url);
      return [
        `• ${i.title}${i.priority === "high" ? " (important)" : ""}`,
        ...(i.body ? [`  ${i.body.replace(/\n/g, "\n  ")}`] : []),
        ...(link ? [`  ${link}`] : []),
        "",
      ];
    }),
    ...(extra > 0 ? [`…and ${extra} more in your Nudge Center: ${inboxUrl}`, ""] : []),
    `Open AVEN: ${inboxUrl}`,
    "",
    `You get these because you turned on email in AVEN. Turn it off any time: ${settingsUrl}`,
  ].join("\n");

  const row = (i: EmailCandidate) => {
    const link = linkFor(input.siteUrl, i.action_url);
    return `<tr><td style="padding:16px 0;border-bottom:1px solid #26262a">
<div style="font-size:12px;color:#8b8b93;text-transform:uppercase;letter-spacing:.06em">${escapeHtml(CATEGORY_LABEL[i.category])}${i.priority === "high" ? ' · <span style="color:#f5b94d">Important</span>' : ""}</div>
<div style="font-size:16px;font-weight:600;color:#f5f5f4;margin-top:4px">${escapeHtml(i.title)}</div>
${i.body ? `<div style="font-size:14px;line-height:1.5;color:#b4b4bb;margin-top:4px;white-space:pre-line">${escapeHtml(i.body)}</div>` : ""}
${link ? `<a href="${escapeHtml(link)}" style="display:inline-block;margin-top:8px;font-size:13px;color:#4ade80">Open in AVEN →</a>` : ""}
</td></tr>`;
  };

  const html = `<!doctype html><html><body style="margin:0;background:#0b0b0c;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0b0c;padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#141415;border:1px solid #26262a;border-radius:16px;padding:28px">
<tr><td style="font-size:13px;font-weight:700;letter-spacing:.18em;color:#f5f5f4">AVEN</td></tr>
<tr><td style="padding-top:18px;font-size:15px;color:#d4d4d8">Hi ${escapeHtml(input.name)},</td></tr>
${items.map(row).join("\n")}
${extra > 0 ? `<tr><td style="padding-top:14px;font-size:14px;color:#b4b4bb">…and ${extra} more in your Nudge Center.</td></tr>` : ""}
<tr><td style="padding-top:22px"><a href="${escapeHtml(inboxUrl)}" style="display:inline-block;background:#f5f5f4;color:#0b0b0c;text-decoration:none;font-weight:600;font-size:14px;padding:10px 18px;border-radius:10px">Open Nudge Center</a></td></tr>
<tr><td style="padding-top:24px;font-size:12px;line-height:1.5;color:#7c7c83">You get these emails because you turned them on in AVEN. <a href="${escapeHtml(settingsUrl)}" style="color:#a3a3a8">Change or turn off email</a>.</td></tr>
</table></td></tr></table></body></html>`;

  return { subject, text, html };
}
