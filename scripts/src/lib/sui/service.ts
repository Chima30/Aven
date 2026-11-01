import {
  SuiProviderError,
  type ActivityItem,
  type ChainInfo,
  type CoinInfo,
  type SuiErrorKind,
  type SuiReader,
} from "./reader";
import { SUI_COIN_TYPE, SUI_DECIMALS, coinSymbolFromType } from "./address";

/**
 * Caching, error-classifying wrapper around a SuiReader. Pure apart from the
 * injected reader and clock, so it is unit-tested with a fake reader.
 */

const GRPC_CODES: Record<string, SuiErrorKind> = {
  UNAUTHENTICATED: "unauthorized",
  PERMISSION_DENIED: "unauthorized",
  RESOURCE_EXHAUSTED: "rate_limited",
  UNIMPLEMENTED: "unsupported",
  UNAVAILABLE: "unavailable",
  DEADLINE_EXCEEDED: "unavailable",
  NOT_FOUND: "not_found",
  INVALID_ARGUMENT: "invalid_input",
};

/** Maps gRPC, gRPC-web and JSON-RPC/HTTP failures to a small set of kinds. */
export function classifySuiError(error: unknown): SuiProviderError {
  if (error instanceof SuiProviderError) return error;
  const e = error as { code?: unknown; status?: unknown; name?: unknown; message?: unknown };
  const message = typeof e?.message === "string" ? e.message : String(error);
  let kind: SuiErrorKind = "unknown";
  if (typeof e?.code === "string" && GRPC_CODES[e.code]) kind = GRPC_CODES[e.code]!;
  else if (typeof e?.code === "number") {
    // @grpc/grpc-js numeric status codes
    kind =
      (
        {
          16: "unauthorized",
          7: "unauthorized",
          8: "rate_limited",
          12: "unsupported",
          14: "unavailable",
          4: "unavailable",
          5: "not_found",
          3: "invalid_input",
        } as Record<number, SuiErrorKind>
      )[e.code] ?? "unknown";
  } else if (typeof e?.status === "number") {
    const s = e.status;
    kind =
      s === 401 || s === 403
        ? "unauthorized"
        : s === 429
          ? "rate_limited"
          : s === 404
            ? "not_found"
            : s === 405 || s === 410 || s === 415 || s === 501
              ? "unsupported"
              : s >= 500
                ? "unavailable"
                : "unknown";
  } else if (/timeout|timed out|ECONNRESET|ENOTFOUND|fetch failed/i.test(message)) {
    kind = "unavailable";
  }
  const safe = message.replace(/[A-Za-z0-9_-]{32,}/g, "[redacted]").slice(0, 200);
  return new SuiProviderError(kind, safe || "Sui request failed");
}

export const SUI_ERROR_COPY: Record<SuiErrorKind, string> = {
  unauthorized: "Tatum rejected the API key. Check TATUM_API_KEY on the server.",
  rate_limited: "Tatum's rate limit was reached. Try again in a minute.",
  unsupported:
    "This request isn't supported by the configured Tatum endpoint. See docs/TATUM_SETUP.md.",
  unavailable: "The Sui network gateway didn't respond. Try again shortly.",
  not_found: "Not found on Sui Mainnet.",
  invalid_input: "Sui rejected the request as invalid.",
  unknown: "Something went wrong reading Sui Mainnet.",
};

type Entry<T> = { value: T; expires: number };

export interface WalletBalance extends CoinInfo {
  balance: string;
}

export interface SuiService {
  transport: SuiReader["transport"];
  chainInfo(): Promise<ChainInfo>;
  walletBalances(owner: string): Promise<WalletBalance[]>;
  sentActivity(owner: string, limit?: number): Promise<ActivityItem[]>;
  transaction(digest: string, owner: string): Promise<ActivityItem | null>;
  coinInfo(coinType: string): Promise<CoinInfo>;
}

export function createSuiService(
  reader: SuiReader,
  options: { now?: () => number; maxEntries?: number } = {},
): SuiService {
  const now = options.now ?? Date.now;
  const maxEntries = options.maxEntries ?? 500;
  const cache = new Map<string, Entry<unknown>>();
  const inflight = new Map<string, Promise<unknown>>();

  async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
    const hit = cache.get(key);
    if (hit && hit.expires > now()) return hit.value as T;
    const pending = inflight.get(key);
    if (pending) return pending as Promise<T>;
    const promise = (async () => {
      try {
        const value = await load();
        if (cache.size >= maxEntries) cache.delete(cache.keys().next().value!);
        cache.set(key, { value, expires: now() + ttlMs });
        return value;
      } catch (error) {
        throw classifySuiError(error);
      } finally {
        inflight.delete(key);
      }
    })();
    inflight.set(key, promise);
    return promise;
  }

  async function coinInfo(coinType: string): Promise<CoinInfo> {
    if (coinType === SUI_COIN_TYPE || coinType.endsWith("::sui::SUI")) {
      return { coinType, symbol: "SUI", name: "Sui", decimals: SUI_DECIMALS };
    }
    return cached(`coin:${coinType}`, 60 * 60_000, async () => {
      try {
        const info = await reader.coinInfo(coinType);
        if (info) return info;
      } catch {
        // Metadata is cosmetic; fall back to the type name with raw units.
      }
      return {
        coinType,
        symbol: coinSymbolFromType(coinType),
        name: coinSymbolFromType(coinType),
        decimals: 0,
      };
    });
  }

  return {
    transport: reader.transport,
    chainInfo: () => cached("chain", 10_000, () => reader.chainInfo()),
    async walletBalances(owner) {
      const balances = await cached(`bal:${owner}`, 30_000, () => reader.balances(owner));
      const withInfo = await Promise.all(
        balances.map(async (b) => ({ ...(await coinInfo(b.coinType)), balance: b.balance })),
      );
      return withInfo.sort((a, b) =>
        a.symbol === "SUI" ? -1 : b.symbol === "SUI" ? 1 : a.symbol.localeCompare(b.symbol),
      );
    },
    sentActivity: (owner, limit = 20) =>
      cached(`act:${owner}:${limit}`, 30_000, () => reader.sentActivity(owner, limit)),
    transaction: (digest, owner) =>
      cached(`tx:${digest}:${owner}`, 5 * 60_000, () => reader.transaction(digest, owner)),
    coinInfo,
  };
}
