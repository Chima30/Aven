import "server-only";
import { createHash } from "node:crypto";
import { tatumConfig } from "@/lib/integrations/config";
import { createSuiReader } from "./client";
import { createSuiService, type SuiService } from "./service";

let cached: { key: string; service: SuiService } | undefined;

/** The process-wide Sui service, or why it is unavailable. */
export function suiRuntime():
  | { available: true; service: SuiService }
  | { available: false; reason: "not_configured" | "invalid_config"; issues?: string[] } {
  const config = tatumConfig();
  if (config.status === "not_configured") return { available: false, reason: "not_configured" };
  if (config.status === "invalid") {
    return { available: false, reason: "invalid_config", issues: config.issues };
  }
  const c = config.config;
  const key = `${c.transport}|${c.grpcHost}|${c.grpcWebUrl}|${c.rpcUrl}|${createHash("sha256").update(c.apiKey).digest("hex")}`;
  if (cached?.key !== key) cached = { key, service: createSuiService(createSuiReader(c)) };
  return { available: true, service: cached.service };
}
