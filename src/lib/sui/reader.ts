import type { ClientWithCoreApi } from "@mysten/sui/client";

/**
 * Read-only Sui Mainnet access used by AVEN. Implementations wrap the
 * official @mysten/sui clients (gRPC by default, JSON-RPC as a deprecated
 * fallback) pointed at Tatum's gateways. AVEN never signs or sends.
 */

export type SuiErrorKind =
  | "unauthorized"
  | "rate_limited"
  | "unsupported"
  | "unavailable"
  | "not_found"
  | "invalid_input"
  | "unknown";

export class SuiProviderError extends Error {
  constructor(
    public readonly kind: SuiErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "SuiProviderError";
  }
}

export interface ChainInfo {
  chainId: string | null;
  checkpoint: string | null;
  epoch: string | null;
  timestampMs: number | null;
}

export interface CoinBalance {
  coinType: string;
  /** Raw integer amount (string). */
  balance: string;
}

export interface CoinInfo {
  coinType: string;
  symbol: string;
  name: string;
  decimals: number;
}

export interface BalanceChangeForAddress {
  coinType: string;
  /** Raw signed integer amount (string). Negative = left this address. */
  amount: string;
}

export interface ActivityItem {
  digest: string;
  timestampMs: number | null;
  checkpoint: string | null;
  success: boolean;
  /** Only the changes affecting the wallet being viewed. */
  changes: BalanceChangeForAddress[];
}

export interface SuiReader {
  readonly transport: "grpc" | "grpc-web" | "jsonrpc";
  chainInfo(): Promise<ChainInfo>;
  balances(owner: string): Promise<CoinBalance[]>;
  coinInfo(coinType: string): Promise<CoinInfo | null>;
  /** Most recent transactions SENT by `owner` (newest first). */
  sentActivity(owner: string, limit: number): Promise<ActivityItem[]>;
  transaction(digest: string, owner: string): Promise<ActivityItem | null>;
}

type CoreTx = {
  digest: string;
  timestampMs: number | null;
  checkpoint: string | null;
  status: { success: boolean };
  balanceChanges?: Array<{ coinType: string; address: string; amount: string }>;
};

export function toActivity(tx: CoreTx, owner: string): ActivityItem {
  const changes = (tx.balanceChanges ?? [])
    .filter((c) => c.address.toLowerCase() === owner.toLowerCase())
    .map((c) => ({ coinType: c.coinType, amount: c.amount }));
  return {
    digest: tx.digest,
    timestampMs: tx.timestampMs,
    checkpoint: tx.checkpoint,
    success: tx.status.success,
    changes,
  };
}

/** Methods shared by every @mysten/sui client through its `core` API. */
export function coreReaderMethods(client: ClientWithCoreApi) {
  return {
    async balances(owner: string): Promise<CoinBalance[]> {
      const out: CoinBalance[] = [];
      let cursor: string | null = null;
      for (let page = 0; page < 5; page += 1) {
        const res = await client.core.listBalances({ owner, cursor, limit: 50 });
        for (const b of res.balances) out.push({ coinType: b.coinType, balance: b.balance });
        if (!res.hasNextPage || !res.cursor) break;
        cursor = res.cursor;
      }
      return out;
    },
    async coinInfo(coinType: string): Promise<CoinInfo | null> {
      const res = await client.core.getCoinMetadata({ coinType });
      if (!res.coinMetadata) return null;
      return {
        coinType,
        symbol: res.coinMetadata.symbol,
        name: res.coinMetadata.name,
        decimals: res.coinMetadata.decimals,
      };
    },
    async sentActivity(owner: string, limit: number): Promise<ActivityItem[]> {
      const res = await client.core.listTransactions({
        filter: { sender: owner },
        order: "descending",
        limit,
        include: { balanceChanges: true },
      });
      return res.transactions.map((r) =>
        toActivity((r.Transaction ?? r.FailedTransaction)!, owner),
      );
    },
    async transaction(digest: string, owner: string): Promise<ActivityItem | null> {
      const res = await client.core.getTransaction({ digest, include: { balanceChanges: true } });
      const tx = res.Transaction ?? res.FailedTransaction;
      return tx ? toActivity(tx, owner) : null;
    },
  };
}
