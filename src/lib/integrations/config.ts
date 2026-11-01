import "server-only";
import { z } from "zod";
import { formatIssues } from "@/lib/env";

/**
 * Optional integration configuration (Walrus Memory and Tatum Sui).
 *
 * These are OPTIONAL: AVEN runs without them, and every feature that needs
 * them shows an honest "not configured" state instead of failing. All values
 * are server-only. None of them may ever be prefixed with NEXT_PUBLIC_.
 */

export type IntegrationConfig<T> =
  | { status: "configured"; config: T }
  | { status: "not_configured"; missing: string[] }
  | { status: "invalid"; issues: string[] };

const httpsUrl = z
  .url("must be a full https:// URL")
  .refine((v) => v.startsWith("https://"), { message: "must use https://" })
  .transform((v) => v.replace(/\/+$/, ""));

/* ------------------------------------------------------------------ Walrus */

export type MemwalConfig = {
  /** Delegate private key (hex Ed25519 seed or suiprivkey1…). Server-only. */
  privateKey: string;
  /** Walrus Memory account object ID (0x…). */
  accountId: string;
  serverUrl: string;
  /** Base namespace; each user gets `${namespace}-u-<hmac>`. */
  namespace: string;
  /** Secret used to derive per-user namespaces (HMAC). */
  namespaceSecret: string;
};

export const memwalSchema = z.object({
  MEMWAL_PRIVATE_KEY: z
    .string()
    .trim()
    .refine((v) => /^(0x)?[0-9a-fA-F]{64}$/.test(v) || /^suiprivkey1[0-9a-z]{20,}$/.test(v), {
      message: "must be a 64-character hex delegate key or a suiprivkey1… string",
    }),
  MEMWAL_ACCOUNT_ID: z
    .string()
    .trim()
    .regex(/^0x[0-9a-fA-F]{1,64}$/, "must be the Walrus Memory account object ID (0x…)"),
  MEMWAL_SERVER_URL: httpsUrl.default("https://relayer.memory.walrus.xyz"),
  MEMWAL_NAMESPACE: z
    .string()
    .trim()
    .regex(/^[a-z0-9][a-z0-9-]{1,40}$/, "use 2–41 lowercase letters, digits or hyphens")
    .default("aven-production"),
  MEMWAL_NAMESPACE_SECRET: z
    .string()
    .min(32, "must be at least 32 random characters (generate with: openssl rand -hex 32)"),
});

const MEMWAL_REQUIRED = [
  "MEMWAL_PRIVATE_KEY",
  "MEMWAL_ACCOUNT_ID",
  "MEMWAL_NAMESPACE_SECRET",
] as const;

export function parseMemwalConfig(
  source: Record<string, string | undefined>,
): IntegrationConfig<MemwalConfig> {
  const blank = (k: string) => !source[k] || source[k]!.trim() === "";
  const missing = MEMWAL_REQUIRED.filter(blank);
  if (missing.length === MEMWAL_REQUIRED.length) return { status: "not_configured", missing };
  const clean = Object.fromEntries(
    Object.entries(source).map(([k, v]) => [k, v && v.trim() !== "" ? v : undefined]),
  );
  const result = memwalSchema.safeParse(clean);
  if (!result.success) return { status: "invalid", issues: formatIssues(result.error) };
  const d = result.data;
  return {
    status: "configured",
    config: {
      privateKey: d.MEMWAL_PRIVATE_KEY,
      accountId: d.MEMWAL_ACCOUNT_ID,
      serverUrl: d.MEMWAL_SERVER_URL,
      namespace: d.MEMWAL_NAMESPACE,
      namespaceSecret: d.MEMWAL_NAMESPACE_SECRET,
    },
  };
}

export function memwalConfig(): IntegrationConfig<MemwalConfig> {
  return parseMemwalConfig({
    MEMWAL_PRIVATE_KEY: process.env.MEMWAL_PRIVATE_KEY,
    MEMWAL_ACCOUNT_ID: process.env.MEMWAL_ACCOUNT_ID,
    MEMWAL_SERVER_URL: process.env.MEMWAL_SERVER_URL,
    MEMWAL_NAMESPACE: process.env.MEMWAL_NAMESPACE,
    MEMWAL_NAMESPACE_SECRET: process.env.MEMWAL_NAMESPACE_SECRET,
  });
}

/* ------------------------------------------------------------------- Tatum */

export type SuiTransport = "grpc" | "grpc-web" | "jsonrpc";

export type TatumConfig = {
  apiKey: string;
  transport: SuiTransport;
  /** host:port for native gRPC (HTTP/2). */
  grpcHost: string;
  /** https:// base URL for gRPC-web. */
  grpcWebUrl: string;
  /** https:// URL for the deprecated JSON-RPC fallback. */
  rpcUrl: string;
};

export const tatumSchema = z.object({
  TATUM_API_KEY: z.string().trim().min(10, "looks too short to be a Tatum API key"),
  TATUM_SUI_TRANSPORT: z.enum(["grpc", "grpc-web", "jsonrpc"]).default("grpc"),
  TATUM_SUI_GRPC_HOST: z
    .string()
    .trim()
    .regex(/^[a-z0-9.-]+:\d{2,5}$/i, "must look like host:port")
    .default("sui-mainnet-grpc.gateway.tatum.io:443"),
  TATUM_SUI_GRPC_WEB_URL: httpsUrl.default("https://sui-mainnet-grpc.gateway.tatum.io"),
  TATUM_SUI_RPC_URL: httpsUrl.default("https://sui-mainnet.gateway.tatum.io"),
});

export function parseTatumConfig(
  source: Record<string, string | undefined>,
): IntegrationConfig<TatumConfig> {
  if (!source.TATUM_API_KEY || source.TATUM_API_KEY.trim() === "") {
    return { status: "not_configured", missing: ["TATUM_API_KEY"] };
  }
  const clean = Object.fromEntries(
    Object.entries(source).map(([k, v]) => [k, v && v.trim() !== "" ? v : undefined]),
  );
  const result = tatumSchema.safeParse(clean);
  if (!result.success) return { status: "invalid", issues: formatIssues(result.error) };
  const d = result.data;
  return {
    status: "configured",
    config: {
      apiKey: d.TATUM_API_KEY,
      transport: d.TATUM_SUI_TRANSPORT,
      grpcHost: d.TATUM_SUI_GRPC_HOST,
      grpcWebUrl: d.TATUM_SUI_GRPC_WEB_URL,
      rpcUrl: d.TATUM_SUI_RPC_URL,
    },
  };
}

export function tatumConfig(): IntegrationConfig<TatumConfig> {
  return parseTatumConfig({
    TATUM_API_KEY: process.env.TATUM_API_KEY,
    TATUM_SUI_TRANSPORT: process.env.TATUM_SUI_TRANSPORT,
    TATUM_SUI_GRPC_HOST: process.env.TATUM_SUI_GRPC_HOST,
    TATUM_SUI_GRPC_WEB_URL: process.env.TATUM_SUI_GRPC_WEB_URL,
    TATUM_SUI_RPC_URL: process.env.TATUM_SUI_RPC_URL,
  });
}

/* ---------------------------------------------------------------- Scheduler */

/**
 * Shared secret that authorises the background scheduler endpoint
 * (/api/cron/nudges). Vercel Cron sends it automatically as
 * `Authorization: Bearer <CRON_SECRET>`; the GitHub Actions schedule sends the
 * same header. Returns null when unset or too short (the endpoint then refuses
 * every request).
 */
export function cronSecret(): string | null {
  const v = process.env.CRON_SECRET?.trim();
  return v && v.length >= 32 ? v : null;
}

/* -------------------------------------------------------------------- Email */

export interface EmailConfig {
  host: string;
  port: number;
  /** Implicit TLS (port 465). Other ports use STARTTLS, which is required. */
  secure: boolean;
  user: string;
  password: string;
  from: string;
}

const EMAIL_REQUIRED = ["SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD", "EMAIL_FROM"] as const;

const emailSchema = z.object({
  SMTP_HOST: z
    .string()
    .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i, "must be a host name such as smtp.gmail.com"),
  SMTP_PORT: z.coerce
    .number()
    .int()
    .refine((p) => [465, 587, 2465, 2587].includes(p), "must be 465 or 587")
    .default(465),
  SMTP_USER: z.string().min(1).max(320),
  SMTP_PASSWORD: z.string().min(8, "looks too short"),
  // "Name <address>" or a bare address; no line breaks (header injection).
  EMAIL_FROM: z
    .string()
    .max(200)
    .regex(
      /^(?:[^<>\r\n]{1,80}<[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+>|[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+)$/,
      'must look like "AVEN <you@example.com>"',
    ),
});

/** Optional SMTP settings for email notifications (works with Gmail, Resend, Brevo…). */
export function parseEmailConfig(
  source: Record<string, string | undefined>,
): IntegrationConfig<EmailConfig> {
  const blank = (k: string) => !source[k] || source[k]!.trim() === "";
  const missing = EMAIL_REQUIRED.filter(blank);
  if (missing.length === EMAIL_REQUIRED.length) return { status: "not_configured", missing };
  if (missing.length > 0) {
    return { status: "invalid", issues: missing.map((k) => `${k} is missing`) };
  }
  const clean = Object.fromEntries(
    Object.entries(source).map(([k, v]) => [k, v && v.trim() !== "" ? v.trim() : undefined]),
  );
  const result = emailSchema.safeParse(clean);
  if (!result.success) return { status: "invalid", issues: formatIssues(result.error) };
  const d = result.data;
  return {
    status: "configured",
    config: {
      host: d.SMTP_HOST,
      port: d.SMTP_PORT,
      secure: d.SMTP_PORT === 465 || d.SMTP_PORT === 2465,
      user: d.SMTP_USER,
      password: d.SMTP_PASSWORD,
      from: d.EMAIL_FROM,
    },
  };
}

export function emailConfig(): IntegrationConfig<EmailConfig> {
  return parseEmailConfig({
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_PORT: process.env.SMTP_PORT,
    SMTP_USER: process.env.SMTP_USER,
    // Gmail shows app passwords with spaces; they work without them.
    SMTP_PASSWORD: process.env.SMTP_PASSWORD?.replace(/\s+/g, ""),
    EMAIL_FROM: process.env.EMAIL_FROM,
  });
}
