import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { tatumConfig, type SuiTransport } from "@/lib/integrations/config";
import { parseSuiAddress } from "@/lib/sui/address";
import { createSuiReader } from "@/lib/sui/client";
import { classifySuiError } from "@/lib/sui/service";

/**
 * TATUM SUI MAINNET CHECK — read-only, run with YOUR key on YOUR machine.
 *
 *   npm run verify:tatum
 *
 * Reads the latest checkpoint (and, if TATUM_VERIFY_ADDRESS is set, that
 * address's balances and recent transactions) through the configured
 * transport. Set TATUM_VERIFY_ALL_TRANSPORTS=1 to also try gRPC-web and the
 * deprecated JSON-RPC endpoint and record which ones your Tatum plan serves.
 * Writes verification/tatum-mainnet-<time>.json (never contains the key).
 */

const config = tatumConfig();
const configured = config.status === "configured";
if (!configured) {
  console.warn(
    config.status === "invalid"
      ? `Tatum live check skipped: invalid settings — ${config.issues.join("; ")}`
      : "Tatum live check skipped: TATUM_API_KEY is not set in .env.local.",
  );
}

type Probe = {
  transport: SuiTransport;
  ok: boolean;
  latency_ms: number;
  chain?: { chainId: string | null; checkpoint: string | null; epoch: string | null };
  balances?: Array<{ coinType: string; balance: string }>;
  activity?: { ok: boolean; count?: number; error?: string };
  error?: { kind: string; message: string };
};

describe.skipIf(!configured)("Tatum Sui Mainnet (read-only)", () => {
  it("reads the latest checkpoint through the configured transport", async () => {
    if (config.status !== "configured") return;
    const transports: SuiTransport[] =
      process.env.TATUM_VERIFY_ALL_TRANSPORTS === "1"
        ? [
            config.config.transport,
            ...(["grpc", "grpc-web", "jsonrpc"] as const).filter(
              (t) => t !== config.config.transport,
            ),
          ]
        : [config.config.transport];
    const address = process.env.TATUM_VERIFY_ADDRESS
      ? parseSuiAddress(process.env.TATUM_VERIFY_ADDRESS)
      : null;

    const probes: Probe[] = [];
    for (const transport of transports) {
      const reader = createSuiReader({ ...config.config, transport });
      const started = Date.now();
      const probe: Probe = { transport, ok: false, latency_ms: 0 };
      try {
        const chain = await reader.chainInfo();
        probe.chain = { chainId: chain.chainId, checkpoint: chain.checkpoint, epoch: chain.epoch };
        probe.ok = chain.checkpoint !== null && /^\d+$/.test(chain.checkpoint);
        if (address) {
          probe.balances = await reader.balances(address);
          try {
            probe.activity = { ok: true, count: (await reader.sentActivity(address, 5)).length };
          } catch (error) {
            const e = classifySuiError(error);
            probe.activity = { ok: false, error: `${e.kind}: ${e.message}` };
          }
        }
      } catch (error) {
        const e = classifySuiError(error);
        probe.error = { kind: e.kind, message: e.message };
      }
      probe.latency_ms = Date.now() - started;
      console.info(
        `${transport}: ${probe.ok ? `checkpoint ${probe.chain?.checkpoint}` : `FAILED (${probe.error?.kind})`}`,
      );
      probes.push(probe);
    }

    const evidence = {
      kind: "aven-tatum-sui-mainnet-check",
      checked_at: new Date().toISOString(),
      network: "mainnet",
      endpoints: {
        grpc: config.config.grpcHost,
        grpc_web: config.config.grpcWebUrl,
        jsonrpc: config.config.rpcUrl,
      },
      address_checked: address,
      probes,
    };
    mkdirSync(join(process.cwd(), "verification"), { recursive: true });
    const file = join(
      process.cwd(),
      "verification",
      `tatum-mainnet-${evidence.checked_at.replace(/[-:.]/g, "")}.json`,
    );
    writeFileSync(file, `${JSON.stringify(evidence, null, 2)}\n`);
    console.info(`Evidence written to ${file}`);

    expect(probes[0]?.ok, `configured transport failed: ${JSON.stringify(probes[0]?.error)}`).toBe(
      true,
    );
  });
});
