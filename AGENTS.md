# Notes for AI coding agents working on AVEN

- This is Next.js 16: Middleware is called **Proxy** (`src/proxy.ts`). Read the guides in
  `node_modules/next/dist/docs/` before using unfamiliar APIs. `cacheComponents` is deliberately off.
- Read `docs/ARCHITECTURE.md`, `docs/SECURITY.md` and `docs/DATABASE.md` before changing anything.
- Work on the current stage only (`docs/ROADMAP.md`). Never start a new stage without approval.
- Every new user-owned table: RLS on, owner policies, explicit grants, add it to
  `USER_OWNED_TABLES` in `tests/db/rls.test.ts` and to `EXPORT_TABLES` in `src/lib/data/export.ts`,
  then run `npm run db:bundle`.
- Money is bigint minor units (`src/lib/money`). Never use floats or add mixed currencies.
- Never add fake data, demo balances or links to unbuilt pages. Never put secrets in code.
- The admin (secret key) client is only for the uses listed in `src/lib/supabase/admin.ts`.
- Run `npm run verify` and `npm run test:db` before handing work back; report what actually ran.
