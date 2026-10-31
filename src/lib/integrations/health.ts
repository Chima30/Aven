import "server-only";
import { createMemwalClient } from "@/lib/memory/client";
import { suiRuntime } from "@/lib/sui/runtime";
import { SuiProviderError } from "@/lib/sui/reader";
import { SUI_ERROR_COPY } from "@/lib/sui/service";
import { memwalConfig, tatumConfig } from "./config";

export type CheckResult<T> =
  | { status: "not_configured" }
  | { status: "invalid"; issues: string[] }
  | { status: "ok"; latencyMs: number; detail: T; checkedAt: string }
  | { status: "error"; latencyMs: number; message: string; checkedAt: string };

const TTL_MS = 30_000;
let walrusCache: { at: number; value: CheckResult<WalrusDetail> } | undefined;
let suiCache: { at: number; value: CheckResult<SuiDetail> } | undefined;

export interface WalrusDetail {
  relayerStatus: string;
  version: string;
  mode: string | null;
  writeReady: boolean | null;
  serverUrl: string;
  namespaceBase: string;
}

export interface SuiDetail {
  transport: string;
  chainId: string | null;
  checkpoint: string | null;
  epoch: string | null;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timed out")), ms)),
  ]);
}

/** Calls the MemWal relayer's /health through the official SDK. Cached for 30 s. */
export async function checkWalrus(): Promise<CheckResult<WalrusDetail>> {
  const config = memwalConfig();
  if (config.status === "not_configured") return { status: "not_configured" };
  if (config.status === "invalid") return { status: "invalid", issues: config.issues };
  if (walrusCache && Date.now() - walrusCache.at < TTL_MS) return walrusCache.value;
  const started = Date.now();
  let value: CheckResult<WalrusDetail>;
  try {
    const health = await withTimeout(createMemwalClient(config.config).health(), 8_000);
    value = {
      status: "ok",
      latencyMs: Date.now() - started,
      checkedAt: new Date().toISOString(),
      detail: {
        relayerStatus: health.status,
        version: health.version,
        mode: health.mode ?? null,
        writeReady: health.write_ready ?? null,
        serverUrl: config.config.serverUrl,
        namespaceBase: config.config.namespace,
      },
    };
  } catch (error) {
    value = {
      status: "error",
      latencyMs: Date.now() - started,
      checkedAt: new Date().toISOString(),
      message: error instanceof Error ? error.message.slice(0, 200) : "Relayer check failed",
    };
  }
  walrusCache = { at: Date.now(), value };
  return value;
}

/** Reads the latest Sui Mainnet checkpoint through Tatum. Cached for 30 s. */
export async function checkSui(): Promise<CheckResult<SuiDetail>> {
  const config = tatumConfig();
  if (config.status === "not_configured") return { status: "not_configured" };
  if (config.status === "invalid") return { status: "invalid", issues: config.issues };
  if (suiCache && Date.now() - suiCache.at < TTL_MS) return suiCache.value;
  const runtime = suiRuntime();
  if (!runtime.available) return { status: "not_configured" };
  const started = Date.now();
  let value: CheckResult<SuiDetail>;
  try {
    const info = await withTimeout(runtime.service.chainInfo(), 10_000);
    value = {
      status: "ok",
      latencyMs: Date.now() - started,
      checkedAt: new Date().toISOString(),
      detail: { transport: runtime.service.transport, ...info },
    };
  } catch (error) {
    const kind = error instanceof SuiProviderError ? error.kind : "unknown";
    value = {
      status: "error",
      latencyMs: Date.now() - started,
      checkedAt: new Date().toISOString(),
      message: `${SUI_ERROR_COPY[kind]}${error instanceof Error ? ` (${error.message.slice(0, 120)})` : ""}`,
    };
  }
  suiCache = { at: Date.now(), value };
  return value;
}
