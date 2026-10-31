import { describe, expect, it, vi } from "vitest";
import { parseTatumConfig } from "@/lib/integrations/config";
import { formatUnits, isSuiDigest, parseSuiAddress, shortAddress } from "@/lib/sui/address";
import { coreReaderMethods, SuiProviderError, toActivity, type SuiReader } from "@/lib/sui/reader";
import { classifySuiError, createSuiService } from "@/lib/sui/service";

/*
 * Mocked Tatum/Sui tests: they check AVEN's handling of the official
 * @mysten/sui client responses and errors. They are NOT a live Mainnet check —
 * run `npm run verify:tatum` with your own key for that.
 */

const ADDR = `0x${"a1".repeat(32)}`;

describe("Sui addresses and amounts", () => {
  it("normalises valid addresses and rejects everything else", () => {
    expect(parseSuiAddress(` ${ADDR.toUpperCase().replace("0X", "0x")} `)).toBe(ADDR);
    expect(parseSuiAddress("0x2")).toBe(`0x${"0".repeat(63)}2`);
    expect(parseSuiAddress("a1".repeat(32))).toBeNull();
    expect(parseSuiAddress("0xZZ")).toBeNull();
    expect(parseSuiAddress(`0x${"a".repeat(65)}`)).toBeNull();
    expect(parseSuiAddress("alice.sui")).toBeNull();
    expect(parseSuiAddress("suiprivkey1qqqq")).toBeNull();
  });

  it("formats raw units exactly, including negatives", () => {
    expect(formatUnits("1234567891", 9)).toBe("1.2345");
    expect(formatUnits("-500000000", 9)).toBe("-0.5");
    expect(formatUnits("123456789000000000", 9)).toBe("123,456,789");
    expect(formatUnits("42", 0)).toBe("42");
    expect(shortAddress(ADDR)).toBe("0xa1a1…a1a1");
  });

  it("validates transaction digests", () => {
    expect(isSuiDigest("GZpCaE8vXz1BsxbAYkMjyxH4yHnZVd5tSjWBBJWKqbWQ")).toBe(true);
    expect(isSuiDigest("not-a-digest")).toBe(false);
  });
});

describe("Tatum configuration", () => {
  it("is optional and defaults to the gRPC gateway", () => {
    expect(parseTatumConfig({}).status).toBe("not_configured");
    expect(parseTatumConfig({ TATUM_API_KEY: "t-1234567890abcdef" })).toMatchObject({
      status: "configured",
      config: {
        transport: "grpc",
        grpcHost: "sui-mainnet-grpc.gateway.tatum.io:443",
        rpcUrl: "https://sui-mainnet.gateway.tatum.io",
      },
    });
  });

  it("rejects unknown transports and http URLs", () => {
    expect(
      parseTatumConfig({ TATUM_API_KEY: "t-1234567890abcdef", TATUM_SUI_TRANSPORT: "ws" }).status,
    ).toBe("invalid");
    expect(
      parseTatumConfig({
        TATUM_API_KEY: "t-1234567890abcdef",
        TATUM_SUI_RPC_URL: "http://x.example",
      }).status,
    ).toBe("invalid");
  });
});

describe("error classification", () => {
  it.each([
    [{ code: "UNAUTHENTICATED", message: "bad key" }, "unauthorized"],
    [{ code: "RESOURCE_EXHAUSTED", message: "slow down" }, "rate_limited"],
    [{ code: "UNIMPLEMENTED", message: "no" }, "unsupported"],
    [{ code: 14, message: "unavailable" }, "unavailable"],
    [{ status: 429, message: "Too Many Requests" }, "rate_limited"],
    [{ status: 401, message: "Unauthorized" }, "unauthorized"],
    [{ status: 415, message: "Unsupported Media Type" }, "unsupported"],
    [new Error("fetch failed"), "unavailable"],
    [new Error("weird"), "unknown"],
  ])("%o → %s", (error, kind) => {
    expect(classifySuiError(error).kind).toBe(kind);
  });

  it("redacts long tokens from messages", () => {
    const e = classifySuiError(new Error(`denied for key t-${"x".repeat(40)}`));
    expect(e.message).not.toContain("x".repeat(40));
  });
});

describe("core client mapping", () => {
  const owner = ADDR;
  const fakeClient = {
    core: {
      listBalances: vi.fn(async ({ cursor }: { cursor: string | null }) =>
        cursor
          ? {
              balances: [
                {
                  coinType: "0xabc::usdc::USDC",
                  balance: "2500000",
                  coinBalance: "2500000",
                  addressBalance: "0",
                },
              ],
              hasNextPage: false,
              cursor: null,
            }
          : {
              balances: [
                {
                  coinType: "0x2::sui::SUI",
                  balance: "1500000000",
                  coinBalance: "1500000000",
                  addressBalance: "0",
                },
              ],
              hasNextPage: true,
              cursor: "c1",
            },
      ),
      getCoinMetadata: vi.fn(async () => ({
        coinMetadata: {
          id: null,
          decimals: 6,
          name: "USD Coin",
          symbol: "USDC",
          description: "",
          iconUrl: null,
        },
      })),
      listTransactions: vi.fn(async () => ({
        transactions: [
          {
            $kind: "Transaction",
            Transaction: {
              digest: "D1",
              timestampMs: 1_790_000_000_000,
              checkpoint: "100",
              status: { success: true, error: null },
              balanceChanges: [
                { coinType: "0x2::sui::SUI", address: owner, amount: "-1000000000" },
                { coinType: "0x2::sui::SUI", address: `0x${"b".repeat(64)}`, amount: "990000000" },
              ],
            },
          },
        ],
        hasNextPage: false,
      })),
      getTransaction: vi.fn(),
    },
  };

  it("pages balances and keeps only the viewed wallet's changes", async () => {
    // Structural fake of the official client's `core` API.
    const methods = coreReaderMethods(fakeClient as never);
    expect(await methods.balances(owner)).toEqual([
      { coinType: "0x2::sui::SUI", balance: "1500000000" },
      { coinType: "0xabc::usdc::USDC", balance: "2500000" },
    ]);
    const activity = await methods.sentActivity(owner, 10);
    expect(fakeClient.core.listTransactions).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: { sender: owner },
        order: "descending",
        include: { balanceChanges: true },
      }),
    );
    expect(activity[0]!.changes).toEqual([{ coinType: "0x2::sui::SUI", amount: "-1000000000" }]);
  });

  it("maps failed transactions too", () => {
    const item = toActivity(
      {
        digest: "D2",
        timestampMs: null,
        checkpoint: null,
        status: { success: false },
        balanceChanges: [],
      },
      owner,
    );
    expect(item).toMatchObject({ success: false, changes: [] });
  });
});

describe("Sui service caching", () => {
  function fakeReader(): SuiReader & { calls: Record<string, number> } {
    const calls: Record<string, number> = {};
    const count = (k: string) => (calls[k] = (calls[k] ?? 0) + 1);
    return {
      calls,
      transport: "grpc",
      async chainInfo() {
        count("chain");
        return { chainId: "35834a8a", checkpoint: "123", epoch: "900", timestampMs: 1 };
      },
      async balances() {
        count("balances");
        return [
          { coinType: "0xabc::usdc::USDC", balance: "2500000" },
          { coinType: "0x2::sui::SUI", balance: "1500000000" },
        ];
      },
      async coinInfo(coinType) {
        count("coin");
        return { coinType, symbol: "USDC", name: "USD Coin", decimals: 6 };
      },
      async sentActivity() {
        count("activity");
        throw Object.assign(new Error("rate"), { code: "RESOURCE_EXHAUSTED" });
      },
      async transaction() {
        return null;
      },
    };
  }

  it("caches within the TTL and refreshes after it", async () => {
    let now = 0;
    const reader = fakeReader();
    const service = createSuiService(reader, { now: () => now });
    await service.chainInfo();
    await service.chainInfo();
    expect(reader.calls.chain).toBe(1);
    now += 11_000;
    await service.chainInfo();
    expect(reader.calls.chain).toBe(2);
  });

  it("puts SUI first and resolves coin metadata once", async () => {
    const reader = fakeReader();
    const service = createSuiService(reader);
    const balances = await service.walletBalances(ADDR);
    expect(balances.map((b) => b.symbol)).toEqual(["SUI", "USDC"]);
    expect(balances[0]).toMatchObject({ decimals: 9, balance: "1500000000" });
    await service.walletBalances(ADDR);
    expect(reader.calls.coin).toBe(1);
  });

  it("surfaces provider errors as typed, user-safe errors", async () => {
    const service = createSuiService(fakeReader());
    await expect(service.sentActivity(ADDR)).rejects.toBeInstanceOf(SuiProviderError);
    await expect(service.sentActivity(ADDR)).rejects.toMatchObject({ kind: "rate_limited" });
  });
});
