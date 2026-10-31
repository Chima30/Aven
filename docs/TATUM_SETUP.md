# Tatum setup (Sui Mainnet, read-only)

AVEN reads public Sui Mainnet data — the latest checkpoint, wallet balances and recent
transactions — through **Tatum**, on the server only. It never holds keys, signs, sends or
moves funds. Without a Tatum key the Sui wallet page still lets users save addresses and says
"not configured".

## Why gRPC and not JSON-RPC

The original plan named Tatum's JSON-RPC endpoint (`https://sui-mainnet.gateway.tatum.io`).
Sui's JSON-RPC API is **deprecated** and was switched off on Sui Foundation Mainnet full nodes
in late July 2026; the official `@mysten/sui` SDK marks `SuiJsonRpcClient` deprecated and
points to `SuiGrpcClient`. Tatum documents a Sui Mainnet **gRPC** gateway that takes the API
key as `x-api-key` metadata. So AVEN uses, by default:

- `@mysten/sui` 2.38 `SuiGrpcClient` (official SDK) …
- … over native gRPC (`@grpc/grpc-js` via `@protobuf-ts/grpc-transport`) to
  `sui-mainnet-grpc.gateway.tatum.io:443`, with `x-api-key` metadata.

Calls used (all read-only): `LedgerService.GetServiceInfo` (checkpoint, epoch, chain id),
`core.listBalances`, `core.getCoinMetadata`, `core.listTransactions` (filtered by sender) and
`core.getTransaction`. JSON-RPC (`sui_getLatestCheckpointSequenceNumber`, `suix_getAllBalances`,
`suix_queryTransactionBlocks` through the SDK) remains available as a fallback with
`TATUM_SUI_TRANSPORT=jsonrpc`, in case your Tatum plan still serves it.

## 1. Get an API key

1. Sign in at **dashboard.tatum.io** (you already have an account).
2. Create an API key for **Mainnet** (Tatum keys are per network type).
3. Copy it. Treat it like a password.

## 2. Configure

`.env.local` (your computer) and Vercel → Settings → Environment Variables (server, no
`NEXT_PUBLIC_` prefix):

```
TATUM_API_KEY=<your Tatum mainnet API key>
TATUM_SUI_TRANSPORT=grpc
TATUM_SUI_GRPC_HOST=sui-mainnet-grpc.gateway.tatum.io:443
TATUM_SUI_GRPC_WEB_URL=https://sui-mainnet-grpc.gateway.tatum.io
TATUM_SUI_RPC_URL=https://sui-mainnet.gateway.tatum.io
```

Only `TATUM_API_KEY` is required; the others are the defaults. Redeploy after changing them.

## 3. Verify (read-only, safe)

```
npm run verify:tatum
```

Optional, to also check a wallet and every transport (PowerShell: set each with `$env:NAME="…";`):

```
TATUM_VERIFY_ADDRESS=0x<a public Sui address> TATUM_VERIFY_ALL_TRANSPORTS=1 npm run verify:tatum
```

It writes `verification/tatum-mainnet-<time>.json` (endpoints, which transports worked, the
checkpoint read, balances/activity for the address) — never the key. If `grpc` fails but
`grpc-web` or `jsonrpc` works on your plan, set `TATUM_SUI_TRANSPORT` to the working one.

In the app: Settings → **Integrations** → _Sui Mainnet via Tatum_ shows the transport and the
latest checkpoint. Money → **Sui wallets** shows balances and recent transactions.

## Limits

- Activity lists transactions **sent by** the wallet (the SDK's transaction filter is by
  sender). Incoming transfers show up in balances.
- AVEN has **no price feed**: when you record an on-chain transaction in AVEN you enter its
  value in the account's currency. AVEN never invents an exchange rate.
- Imports are refused if that digest was already imported, and need explicit confirmation if
  a transaction with the same amount, account and date (±1 day) already exists.
- Provider usage is bounded: results are cached (balances/activity 30 s, checkpoint 10 s) and
  each user has a rate limit on wallet refreshes and imports.

## Troubleshooting

| Integrations says                          | Meaning / fix                                                                    |
| ------------------------------------------ | -------------------------------------------------------------------------------- |
| "Tatum rejected the API key"               | Wrong key, or a testnet key. Create a Mainnet key.                               |
| "Not supported by the configured endpoint" | Try `TATUM_SUI_TRANSPORT=grpc-web`, or `jsonrpc` if your plan still serves it.   |
| "Rate limit was reached"                   | Your Tatum plan's limit; wait a minute.                                          |
| "Didn't respond"                           | Network or gateway issue; on Vercel make sure functions run on the Node runtime. |
