# Integration repair — 31 October 2026

## Root cause

The Stage 2 upload was placed **inside `public/`** instead of at the repository root
(`public/src`, `public/supabase`, `public/tests`, `public/docs`, `public/scripts`,
`public/.github`, `public/package.json`, even `public/public/icons`). The root kept the
Stage 1 files. Consequences:

1. **283 TypeScript errors in CI.** `tsconfig.json` type-checks every `**/*.ts(x)`, so the
   Stage 2 files under `public/src/…` were compiled. Their `@/…` imports resolve to the root
   `src/`, which was still Stage 1, so: finance modules and `@/lib/auth/recovery` "missing",
   `Outbox`/`SyncEngine`/`SyncResult`/`OutboxEntry` signatures not matching (Stage 2 code
   compiled against the Stage 1 offline layer), and many implicit `any` errors cascading from
   unresolved imports. No error came from the root `src/`.
2. **The live site ran Stage 1 code**, with the Stage 2 database objects possibly installed
   but unused.
3. **Everything in `public/` was publicly downloadable** from the deployed site (Next.js serves
   `public/` as static files): source code, SQL migrations, tests and docs. A check found **no
   secrets** in those files (`.env.example` contains variable names only), so no key rotation
   is needed.

## Fix

- Moved every Stage 2 file from `public/` to its correct place at the root, replacing the
  Stage 1 versions. The `public/` copy was verified **byte-for-byte identical** to the Stage 2
  delivery before moving.
- `public/` now contains only `sw.js` (Stage 2 version) and `icons/`.
- Removed `supabase/stage1_all_in_one.sql` (replaced by `setup_all_in_one.sql` and `upgrades/`).

## Additional findings fixed during the audit

- `src/lib/supabase/database.types.ts` was missing the `sync_receipts.response` column (added
  by the Stage 2 migration) and had no type for `rate_limit_buckets`. Both added. The
  `sync_receipts` insert type is now `never`, because only `apply_finance_mutation()` writes it.
- New test `tests/db/types.test.ts` compares the TypeScript types with the real migrated
  schema (every table, view, column and public function), so drift fails CI.
- New guard `scripts/check-structure.mjs` (`npm run check:structure`, first step of CI and
  `npm run verify`) fails if source, SQL, docs or a second project copy end up in `public/`
  or anywhere outside the root.

## Database

No new migrations. The Stage 2 database files are unchanged. If your Supabase project
doesn't yet have the `transactions` table, run `supabase/upgrades/stage2.sql` once (see
SUPABASE_SETUP.md, step 2).
