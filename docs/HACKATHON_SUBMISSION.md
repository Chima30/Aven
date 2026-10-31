# Hackathon submission

Everything in `[[double brackets]]` is a placeholder **you** fill in. None of these values were
invented; leave a placeholder rather than guessing.

## Identifiers and links

| Item                           | Value                                       | Where to find it                                                          |
| ------------------------------ | ------------------------------------------- | ------------------------------------------------------------------------- |
| Project name                   | AVEN                                        |                                                                           |
| GitHub repository              | https://github.com/Chima30/aven             | (make sure it's public, or grant the judges access)                       |
| Live app                       | [[YOUR_VERCEL_URL]]                         | Vercel → project → Domains                                                |
| Demo video (2–3 min)           | [[DEMO_VIDEO_URL]]                          | Record with docs/DEMO_SCRIPT.md                                           |
| Blog post                      | [[BLOG_POST_URL]]                           | Publish docs/BLOG_POST.md                                                 |
| Tatum account ID               | [[TATUM_ACCOUNT_ID]]                        | dashboard.tatum.io → account / profile                                    |
| Sui address (submitter)        | [[YOUR_SUI_ADDRESS]]                        | Your Sui wallet                                                           |
| Walrus Memory account ID       | [[MEMWAL_ACCOUNT_ID]]                       | memory.walrus.xyz (same as the `MEMWAL_ACCOUNT_ID` variable; it's public) |
| MemWal agent ID                | [[MEMWAL_AGENT_ID]]                         | memory.walrus.xyz, if the submission form asks for it                     |
| Delegate key public address    | [[DELEGATE_SUI_ADDRESS]]                    | `delegate_sui_address` in your `verification/walrus-mainnet-*.json`       |
| Walrus Mainnet evidence file   | [[verification/walrus-mainnet-RUN_ID.json]] | Written by `npm run verify:walrus` with authorisation                     |
| Tatum Mainnet evidence file    | [[verification/tatum-mainnet-TIME.json]]    | Written by `npm run verify:tatum`                                         |
| Example Walrus blob IDs (≥ 10) | [[BLOB_ID_1 … BLOB_ID_10]]                  | From the evidence file, or Intelligence → Walrus Memory                   |

## Short description (≤ 280 characters)

AVEN is a personal finance companion that remembers your decisions on Walrus. It explains your
spending with checkable numbers, suggests changes you can accept, decline or adjust, and
learns from what it recalls from Walrus Mainnet. Sui wallets are read via Tatum.

## Long description

AVEN tracks accounts, spending, budgets and savings goals — online and offline — and turns them
into deterministic insights: categories over budget, fixed vs. variable spending, recurring
payments and subscriptions, income pattern, savings rate and goal pace. Each recommendation
shows the numbers behind it. Users accept, decline or change the amount.

Every answer becomes a structured memory stored on **Walrus Mainnet** through the official
MemWal SDK and relayer, in a private per-user namespace derived on the server. Before the next
recommendation, AVEN **recalls those memories from Walrus** and adapts: a declined 10% cut
becomes a gentler 5%; a changed amount becomes the target; a second decline stops the
suggestion; a savings target that exists only in Walrus changes the savings advice. Each
adapted card says which memory (by blob ID) changed it and how.

Memory is opt-in with upfront disclosures — including that the MemWal SDK cannot delete from
Walrus, so "forget" means AVEN permanently stops using a memory. Users can list every memory,
read it back from Walrus, forget one or all, and pause memory.

AVEN also reads public **Sui Mainnet** wallets through **Tatum's gRPC gateway** (Sui JSON-RPC
is deprecated), showing balances and recent transactions separately from AVEN's own records.
An on-chain transaction only becomes an AVEN transaction after the user confirms it, with
digest and near-duplicate checks. AVEN never holds keys or moves funds, and no AI model
invents any number.

## How Walrus is used

- Official SDK `@mysten-incubation/memwal` 0.1.12; hosted Mainnet relayer.
- `remember` (idempotency key + content dedupe) → `getRememberStatus` until `done` with a blob
  id → `recall` in the user's namespace → parsed into learning signals.
- Supabase stores only bookkeeping (label, hash, job id, blob id, status); the text lives on
  Walrus. See docs/MEMORY.md and docs/INTELLIGENCE.md.

## How Tatum / Sui is used

- `@mysten/sui` 2.38 `SuiGrpcClient` → `sui-mainnet-grpc.gateway.tatum.io:443` with
  `x-api-key`: service info (checkpoint), balances, coin metadata, transactions by sender,
  transaction lookup for import verification. JSON-RPC fallback available. See docs/TATUM_SETUP.md.

## Submission checklist

- [ ] Supabase: Stage 3 and Stage 4 SQL upgrades run (docs/SUPABASE_SETUP.md)
- [ ] Vercel: MEMWAL_* and TATUM_API_KEY set (server only), redeployed
- [ ] Settings → Integrations shows both **Connected**
- [ ] `npm run verify:tatum` passed; evidence file saved
- [ ] `npm run verify:walrus` with `AVEN_WALRUS_MAINNET_CONFIRM=I_AUTHORISE_MAINNET_WRITES`
      passed with **≥ 10 stored** memories; evidence file saved (and committed if you want)
- [ ] In the live app: memory allowed, a recommendation answered, memory shows _Stored on
      Walrus_, and a later recommendation shows _Shaped by your memory_
- [ ] Demo video recorded and uploaded → link above
- [ ] Blog post published → link above
- [ ] All `[[placeholders]]` above filled in
- [ ] Repository public (or judges invited); `.env.local` NOT committed (GitHub Desktop must not
      list it)
- [ ] Short and long descriptions pasted into the submission form

## What is and isn't verified (be precise with judges)

- Automated: unit, database (RLS, isolation, functions) and end-to-end tests pass; the memory
  and learning logic run against the **official MemWal mock**; Sui handling against mocked
  SDK responses.
- Live Mainnet storage and Tatum access are verified **only** by your `verify:walrus` /
  `verify:tatum` runs and their evidence files. Don't claim more than those files show.
