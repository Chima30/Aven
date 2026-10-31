import "server-only";
import { ChannelCredentials } from "@grpc/grpc-js";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { JsonRpcHTTPTransport, SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { GrpcTransport } from "@protobuf-ts/grpc-transport";
import type { TatumConfig } from "@/lib/integrations/config";
import { coreReaderMethods, type ChainInfo, type SuiReader } from "./reader";

/**
 * Tatum Sui Mainnet readers built on the official @mysten/sui clients.
 *
 * Why gRPC: Sui's JSON-RPC API is deprecated and was switched off on Sui
 * Foundation Mainnet full nodes in late July 2026; Sui's own SDK marks
 * SuiJsonRpcClient deprecated and points to SuiGrpcClient. Tatum documents a
 * Sui Mainnet gRPC gateway (sui-mainnet-grpc.gateway.tatum.io:443) that takes
 * the API key as `x-api-key` metadata.
 *
 *   grpc      native gRPC over HTTP/2 (@grpc/grpc-js). Default. Node runtime only.
 *   grpc-web  gRPC-web over fetch, in case a deployment can't use HTTP/2 gRPC.
 *   jsonrpc   deprecated JSON-RPC at TATUM_SUI_RPC_URL, kept only as a fallback.
 *
 * The API key is attached on the server. It is never sent to the browser.
 */
export function createSuiReader(config: TatumConfig): SuiReader {
  const timeout = 12_000;
  if (config.transport === "jsonrpc") {
    const client = new SuiJsonRpcClient({
      network: "mainnet",
      transport: new JsonRpcHTTPTransport({
        url: config.rpcUrl,
        rpc: { headers: { "x-api-key": config.apiKey } },
      }),
    });
    return {
      transport: "jsonrpc",
      ...coreReaderMethods(client),
      async chainInfo(): Promise<ChainInfo> {
        const [checkpoint, chain] = await Promise.all([
          client.getLatestCheckpointSequenceNumber(),
          client.core.getChainIdentifier(),
        ]);
        return { chainId: chain.chainIdentifier, checkpoint, epoch: null, timestampMs: null };
      },
    };
  }

  const client =
    config.transport === "grpc-web"
      ? new SuiGrpcClient({
          network: "mainnet",
          baseUrl: config.grpcWebUrl,
          meta: { "x-api-key": config.apiKey },
          timeout,
        })
      : new SuiGrpcClient({
          network: "mainnet",
          transport: new GrpcTransport({
            host: config.grpcHost,
            channelCredentials: ChannelCredentials.createSsl(),
            meta: { "x-api-key": config.apiKey },
            timeout,
          }),
        });

  return {
    transport: config.transport,
    ...coreReaderMethods(client),
    async chainInfo(): Promise<ChainInfo> {
      const { response } = await client.ledgerService.getServiceInfo({});
      const seconds = response.timestamp?.seconds;
      return {
        chainId: response.chainId ?? null,
        checkpoint: response.checkpointHeight?.toString() ?? null,
        epoch: response.epoch?.toString() ?? null,
        timestampMs:
          seconds !== undefined
            ? Number(seconds) * 1000 + Math.floor((response.timestamp?.nanos ?? 0) / 1e6)
            : null,
      };
    },
  };
}
