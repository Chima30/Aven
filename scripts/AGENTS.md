# Notes for AI coding agents working on AVEN

- This is Next.js 16: Middleware is called **Proxy** (`src/proxy.ts`). Read the guides in
  `node_modules/next/dist/docs/` before using unfamiliar APIs. `cacheComponents` is deliberately off.
- Read `docs/ARCHITECTURE.md`, `docs/SECURITY.md` and `docs/DATABASE.md` before changing anything.
- Follow `docs/ROADMAP.md`; don't start unplanned features without approval.
- Every new user-owned table: RLS on, owner policies, explicit grants, add it to
  `USER_OWNED_TABLES` in `tests/db/rls.test.ts` and to `EXPORT_TABLES` in `src/lib/data/export.ts`,
  then run `npm run db:bundle` (regenerates setup_all_in_one.sql and upgrades/stageN.sql;
  add the new stage's date prefix to STAGES in scripts/build-all-in-one-sql.mjs).
- Finance writes go ONLY through `apply_finance_mutation()`. Transaction changes go ONLY through
  the IndexedDB outbox (`src/lib/finance/queue.ts`). See docs/FINANCE.md and docs/OFFLINE.md.
- Money is bigint minor units (`src/lib/money`). Never use floats or add mixed currencies.
- Never add fake data, demo balances or links to unbuilt pages. Never put secrets in code.
- The admin (secret key) client is only for the uses listed in `src/lib/supabase/admin.ts`.
- Walrus Memory: only `src/lib/memory/service.ts` calls the MemWal SDK, and every write goes
  through `evaluateMemoryCandidate()`. Namespaces come from the session user id only. The SDK
  has no delete; don't claim deletion. Tests use the official `MemWalMock`; never present mock
  results as Mainnet evidence (only `npm run verify:walrus` output counts).
- Sui/Tatum: read-only, server-side, through `src/lib/sui`. Never merge on-chain data into
  finance records except via `import_chain_transaction()` after user confirmation.
- The intelligence engine is deterministic; no AI model may produce balances or figures.
- Run `npm run verify` and `npm run test:db` before handing work back; report what actually ran.
