# Offline-first sync engine

## Goal

Logging an expense, a glass of water or a habit must never fail because the connection is
poor. Changes are saved on the device first and synced to Supabase (the source of truth) when
the network allows, without duplicates and without silently overwriting anything.

## Pieces (Stage 1 status)

| Piece                                                               | File                                     | Status                                       |
| ------------------------------------------------------------------- | ---------------------------------------- | -------------------------------------------- |
| PWA manifest and icons                                              | `src/app/manifest.ts`, `public/icons/`   | ✅ built                                     |
| Service worker (assets + offline page only, never private pages)    | `public/sw.js`                           | ✅ built                                     |
| IndexedDB schema (`outbox`, `meta`)                                 | `src/lib/offline/db.ts`                  | ✅ built + tested                            |
| Outbox (queue)                                                      | `src/lib/offline/outbox.ts`              | ✅ built + tested                            |
| Sync engine                                                         | `src/lib/offline/sync-engine.ts`         | ✅ built + tested (with a fake server)       |
| Server idempotency (`sync_receipts`, unique per user + mutation id) | migration 3                              | ✅ built + tested                            |
| Visible status (Online / Offline / Syncing n / n need attention)    | `src/components/offline/sync-status.tsx` | ✅ built                                     |
| Transport to Supabase + per-entity apply functions                  | —                                        | ⏳ Stage 2 (finance) and Stage 5 (wellbeing) |
| Conflict resolution UI                                              | —                                        | ⏳ Stage 2                                   |

## The outbox contract

Each offline change is one `OutboxEntry` (`src/lib/offline/types.ts`):
`mutationId` (client UUID), `userId`, `entity`, `operation` (create/update/delete), `recordId`
(client UUID for creates), `payload`, `baseVersion` (server version the edit was based on),
`status`, `attempts`, `nextAttemptAt`, `lastError`, timestamps and `serverVersion`.

States: **pending → syncing → synced**, or **failed** (with a reason: `conflict`, `rejected`,
`exhausted`). Failed entries are never dropped automatically; the user retries, edits or
discards them. Only failed entries can be discarded.

## Guarantees and how they're achieved

| Guarantee              | Mechanism                                                                                                                                                                                                                     |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No duplicates on retry | Server inserts a `sync_receipts` row keyed by `(user_id, client_mutation_id)` in the same transaction as the change. A repeat returns `duplicate`, which the client treats as synced. Tested with a "response lost" scenario. |
| Correct order          | Entries are processed oldest-first per user; the run stops at the first network error so later edits never overtake earlier ones.                                                                                             |
| Retry with backoff     | Exponential backoff with full jitter (2 s → 5 min cap), 8 attempts, then `failed/exhausted`.                                                                                                                                  |
| Crash safety           | Entries stuck in `syncing` for > 2 minutes are reclaimed (safe because the server de-duplicates).                                                                                                                             |
| No silent overwrite    | Updates carry `baseVersion`; the server returns `conflict` if its version differs. Conflicts become `failed/conflict` for the user to resolve.                                                                                |
| Expired session        | `auth_required` pauses the run and leaves entries pending.                                                                                                                                                                    |
| One run at a time      | Single-flight guard in the engine (Stage 2 adds a Web Locks guard across tabs).                                                                                                                                               |
| Account separation     | Entries carry `userId`; the engine only processes the signed-in user's entries; sign-out wipes IndexedDB.                                                                                                                     |
| Honest balances        | Stage 2 rule: balances shown as "synced" are computed from server data only; pending local items are shown separately, labelled "on this device".                                                                             |

## Why not localStorage

It's synchronous, small, string-only and can be cleared without warning. It's used only for
trivial preferences, never for queued data.

## Sign-out warning (Stage 2)

Signing out wipes local data. Once offline logging exists, the sign-out button will warn when
unsynced entries are present and offer to sync first.
