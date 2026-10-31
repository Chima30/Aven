# Offline-first sync engine

## Goal

Recording an expense must never fail because the connection is poor. Every
transaction change is saved on the device first (IndexedDB) and then synced to
Supabase — the source of truth — without duplicates, without silently overwriting
anything, and with a visible status.

## Status (Stage 2)

| Piece                                                                             | File                                                    | Status  |
| --------------------------------------------------------------------------------- | ------------------------------------------------------- | ------- |
| IndexedDB (`outbox`, `meta`, `cache`)                                             | `src/lib/offline/db.ts`                                 | ✅ v2   |
| Outbox (persistent queue)                                                         | `src/lib/offline/outbox.ts`                             | ✅      |
| Batch sync engine                                                                 | `src/lib/offline/sync-engine.ts`                        | ✅      |
| Browser controller (triggers, cross-tab lock, events)                             | `src/lib/offline/controller.ts`                         | ✅      |
| HTTP transport                                                                    | `src/lib/offline/transport.ts` → `POST /api/sync`       | ✅      |
| Server endpoint (origin check, rate limit, per-item Zod, DB function)             | `src/app/api/sync/route.ts`                             | ✅      |
| Idempotent, versioned database writes                                             | `apply_finance_mutation()`                              | ✅      |
| Safe local edit/cancel rules                                                      | `src/lib/finance/queue.ts`                              | ✅      |
| Pending list, projected balances, sync status, Sync page with conflict resolution | `src/components/finance/*`, `/money/sync`               | ✅      |
| Offline entry on the cached offline page                                          | `src/app/offline/offline-quick-add.tsx`, `public/sw.js` | ✅      |
| Wellbeing offline logging                                                         | —                                                       | Stage 5 |

## One path for every transaction change

The transaction form never calls the server directly. It writes an outbox entry,
then asks the controller to sync. Online, that happens immediately; offline, it waits.
So online and offline entry behave identically, and a request lost mid-flight is never lost.

```
Form ──► Outbox (IndexedDB, status=pending) ──► SyncEngine ──► POST /api/sync ──► apply_finance_mutation()
                                ▲                                   │
                                └──── synced / failed(+reason) ◄─────┘
```

## Entry contract

`mutationId` (UUID, the idempotency key) · `userId` · `entity` · `operation`
(create/update/delete) · `recordId` (client UUID, stable across sync) · `payload`
(Zod-validated wire format, amounts as minor-unit strings) · `baseVersion` (server
version the edit was based on) · `snapshot` (server copy before an edit, for
projections and conflict display) · `createdOffline` · `status` · `attempts` ·
`nextAttemptAt` · `lastError {kind, message}` · `conflictRecord` · timestamps.

States: **pending → syncing → synced**, or **failed** with `conflict`,
`rejected` or `exhausted`. Failed entries are never removed automatically.

## Sync triggers

On enqueue · when the browser comes back online · when the tab becomes visible or
is restored from the back/forward cache · every 10 s while work is waiting · "Sync now".

**Cross-tab coordination.** A Web Lock (`aven-sync`) lets one tab sync at a time.
While holding it, the tab resets any entries left in `syncing` by a page that was
closed or navigated away mid-request. If the lock stays busy (a frozen page can hold
it indefinitely), it is taken over after two 1.5 s waits. That is safe because the
**server**, not the lock, guarantees no duplicates. This exact scenario was found and
fixed by the end-to-end tests.

## Idempotency and retries

- The server stores a receipt per `(user_id, mutation_id)` with the full response, in
  the same database transaction as the change. A repeat returns the stored response
  (`replayed: true`) and changes nothing.
- Concurrent deliveries of the same mutation are serialised with an advisory lock (tested).
- Network errors, 5xx and 429 retry with exponential backoff and full jitter (2 s →
  5 min, 8 attempts), then `failed/exhausted` with a "Try again" button.
- 401 (session expired) keeps everything queued until the user signs in.
- Each mutation in a batch is validated separately; one invalid entry is `rejected`
  without blocking the rest.
- After a batch applies offline-created changes, one `sync_completed` event is recorded.

## Editing "where safe"

| Situation                                                                     | What happens                                                          |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Edit/cancel a change that has **never been sent**                             | Changed or removed in place                                           |
| Edit/delete a change that **may have reached the server** (sent, answer lost) | Refused with "still syncing — try again in a moment" until it settles |
| Edit a synced transaction                                                     | New `update` entry with `baseVersion` and `snapshot`                  |
| Delete a synced transaction                                                   | Confirmation dialog → `delete` entry with `baseVersion`               |
| Delete a device-only transaction                                              | Cancelled locally; nothing is sent                                    |

## Conflicts

A conflict happens when the server's version differs from `baseVersion`, or the record
was deleted on the server. AVEN never overwrites. The change becomes `failed/conflict`
with the server's copy attached, and **Money → Sync** shows both versions:

- **Keep my version** — re-queued as an update on top of the server's current version
  (or recreated as a new transaction if the server copy is gone).
- **Keep server version** — the local change is discarded.
- Rejected changes (invalid on the server) can only be discarded and re-entered.

## Balances while offline

- **Confirmed balance**: calculated by the server from synced data only.
- **Projected balance**: confirmed + pending local changes (`projectBalances`), always
  labelled "Projected · includes N unsynced changes". It is never presented as confirmed.
- Pages with server totals show a banner when unsynced changes exist and aren't included.

## Offline page and caching

- The service worker never caches pages, because signed-in pages contain personal data.
  It caches `/_next/static` assets, icons and the static `/offline` page.
- On install it also pre-caches the scripts the offline page needs. Opening AVEN with no
  connection shows the offline page with a working **Record a transaction offline** form.
- That form uses a copy of the user's accounts and categories cached in IndexedDB the last
  time the Money section was opened online.
- Sign-out warns if anything is unsynced (and offers "Sync now"), then wipes IndexedDB and
  caches and sends `Clear-Site-Data`.

## Known limits

- Accounts, budgets, goals and categories are managed online only.
- Background Sync API is not used (no Safari support); syncing happens when AVEN is open.
- Two tabs can briefly both sync after a lock takeover; the server's idempotency keeps that safe.
