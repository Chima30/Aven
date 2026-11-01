import { describe, expect, it } from "vitest";
import { parseEmailConfig } from "@/lib/integrations/config";
import {
  buildNudgeEmail,
  qualifiesForEmail,
  type EmailCandidate,
} from "@/lib/nudges/email-content";

const now = new Date("2026-11-05T09:00:00Z");
const base: EmailCandidate = {
  id: "n1",
  kind: "task_reminder",
  category: "planning",
  priority: "normal",
  title: "Reminder: Pay rent",
  body: "Due today.",
  action_url: "/planning/tasks",
  status: "delivered",
  read_at: null,
  dismissed_at: null,
  emailed_at: null,
  email_attempts: 0,
  delivered_at: "2026-11-05T08:30:00Z",
};

describe("which nudges are emailed", () => {
  it("'all' sends every fresh, unread, delivered nudge exactly once", () => {
    expect(qualifiesForEmail(base, "all", now)).toBe(true);
    expect(qualifiesForEmail({ ...base, emailed_at: "2026-11-05T08:31:00Z" }, "all", now)).toBe(
      false,
    );
    expect(qualifiesForEmail({ ...base, read_at: "2026-11-05T08:40:00Z" }, "all", now)).toBe(false);
    expect(qualifiesForEmail({ ...base, dismissed_at: "2026-11-05T08:40:00Z" }, "all", now)).toBe(
      false,
    );
    expect(qualifiesForEmail({ ...base, status: "suppressed" }, "all", now)).toBe(false);
    expect(qualifiesForEmail({ ...base, status: "scheduled" }, "all", now)).toBe(false);
  });

  it("never emails an old backlog or retries forever", () => {
    expect(qualifiesForEmail({ ...base, delivered_at: "2026-11-05T05:00:00Z" }, "all", now)).toBe(
      false,
    );
    expect(qualifiesForEmail({ ...base, email_attempts: 3 }, "all", now)).toBe(false);
  });

  it("'summaries' sends only summaries, important nudges and security alerts", () => {
    expect(qualifiesForEmail(base, "summaries", now)).toBe(false);
    expect(qualifiesForEmail({ ...base, kind: "daily_summary" }, "summaries", now)).toBe(true);
    expect(qualifiesForEmail({ ...base, priority: "high" }, "summaries", now)).toBe(true);
    expect(qualifiesForEmail({ ...base, category: "account_security" }, "summaries", now)).toBe(
      true,
    );
  });
});

describe("the email itself", () => {
  it("escapes content, links only internal paths and includes an off switch", () => {
    const email = buildNudgeEmail({
      name: "Floki <b>",
      siteUrl: "https://aven.example",
      items: [
        { ...base, title: "<script>alert(1)</script>", body: "a & b" },
        { ...base, id: "n2", action_url: "//evil.example/x", priority: "high" },
      ],
    });
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
    expect(email.html).toContain("Floki &lt;b&gt;");
    expect(email.html).toContain("https://aven.example/planning/tasks");
    expect(email.html).not.toContain("evil.example");
    expect(email.html).toContain("https://aven.example/settings/notifications");
    expect(email.text).toContain("Turn it off any time");
    expect(email.subject).toBe("2 updates from AVEN (1+ important)");
  });

  it("uses a single nudge's title as the subject, without line breaks", () => {
    const email = buildNudgeEmail({
      name: "F",
      siteUrl: "https://aven.example",
      items: [{ ...base, title: "Line one\r\nBcc: x@y.z" }],
    });
    expect(email.subject).toBe("Line one Bcc: x@y.z");
    expect(email.subject).not.toMatch(/[\r\n]/);
  });
});

describe("SMTP settings", () => {
  const good = {
    SMTP_HOST: "smtp.gmail.com",
    SMTP_PORT: "465",
    SMTP_USER: "me@gmail.com",
    SMTP_PASSWORD: "abcdabcdabcdabcd",
    EMAIL_FROM: "AVEN <me@gmail.com>",
  };
  it("is optional, and reports partial setups by name without echoing values", () => {
    expect(parseEmailConfig({}).status).toBe("not_configured");
    const partial = parseEmailConfig({ SMTP_HOST: "smtp.gmail.com" });
    expect(partial).toMatchObject({ status: "invalid" });
    expect(JSON.stringify(partial)).toContain("SMTP_PASSWORD is missing");
  });
  it("accepts Gmail settings and picks TLS from the port", () => {
    expect(parseEmailConfig(good)).toMatchObject({
      status: "configured",
      config: { secure: true, port: 465 },
    });
    expect(parseEmailConfig({ ...good, SMTP_PORT: "587" })).toMatchObject({
      config: { secure: false },
    });
  });
  it("rejects header-injection in EMAIL_FROM and odd ports", () => {
    expect(
      parseEmailConfig({ ...good, EMAIL_FROM: "AVEN <me@gmail.com>\nBcc: x@y.z" }).status,
    ).toBe("invalid");
    expect(parseEmailConfig({ ...good, SMTP_PORT: "25" }).status).toBe("invalid");
    const bad = parseEmailConfig({ ...good, SMTP_PASSWORD: "pw1234" });
    expect(bad.status).toBe("invalid");
    expect(JSON.stringify(bad)).not.toContain("pw1234");
  });
});
