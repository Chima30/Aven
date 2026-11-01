# Finance (Stage 2)

## Data model

| Table                    | Holds                                                   | Key rules                                                                                                                                         |
| ------------------------ | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `financial_accounts`     | Cash, bank, savings, credit card, digital wallet, other | Own currency (fixed after creation), opening balance (may be negative), archive instead of delete, `version`                                      |
| `transaction_categories` | Per-user income/expense categories                      | 18 defaults seeded per user (also for existing users on upgrade); rename/archive any; unique active name per type                                 |
| `transactions`           | Income, expense, transfer                               | Client-generated `id`; `amount_minor > 0`; currency must equal the account's; transfers name both accounts, same currency, no category; `version` |
| `budgets`                | Monthly limits, all spending or one expense category    | One active budget per currency + category; alert threshold (default 80%)                                                                          |
| `savings_goals`          | Target, currency, optional date, status                 | Saved amount is calculated, not stored                                                                                                            |
| `savings_goal_entries`   | Contributions and withdrawals                           | Tracking records only; a withdrawal can't exceed the saved amount (row lock prevents races)                                                       |
| `finance_events`         | Facts for the Stage 3 Nudge Center                      | De-duplicated by key; not notifications                                                                                                           |

Read models: `account_balances` and `savings_goal_progress` views; functions
`finance_summary`, `spending_by_category`, `monthly_cashflow`, `budget_progress`,
`budget_history`, `list_transactions`. All are `SECURITY INVOKER` (RLS applies) and
return aggregated money as text.

## Balance rules

```
balance = opening_balance
        + Σ income                      (into this account)
        − Σ expenses                    (from this account)
        − Σ transfers out               (account_id = this account)
        + Σ transfers in                (transfer_account_id = this account)
```

- Balances are **calculated on read** from the opening balance and the transactions.
  They are never stored or updated incrementally, so there is nothing to race on and
  nothing that can drift or be double-counted.
- The opening balance lives on the account, never as a transaction, so it is counted
  exactly once. Editing it shifts the balance by the difference.
- A transfer is **one row** naming both accounts, so it is atomic by construction:
  there is no way for one side to exist without the other.
- Transfers never appear in income, expense, budget or category figures.
- Archived accounts keep their history and balance but are excluded from totals and
  cannot receive new transactions.

## Currency handling

- Amounts are integer **minor units** with a currency code; precision comes from the
  ISO 4217 table (JPY 0, NGN/USD 2, KWD 3…). Input with too many decimals is
  rejected, never rounded.
- The amount field accepts the user's decimal separator (from their number-format
  preference), e.g. `1.234,50` for `dot_comma`.
- A single stored amount is capped at 9,000,000,000,000,000 minor units so it stays
  exact in JavaScript; sums are returned from the database as text and handled as `BigInt`.
- Totals are **grouped by currency**. Nothing adds different currencies together, and
  there is no automatic conversion. Transfers require the same currency on both sides.
- Budgets and goals have one currency; only expenses in that currency count.

## The write path

All finance writes go through one database function:

```
apply_finance_mutation(mutation_id, entity, operation, record_id, payload, base_version, device_id)
```

1. Identifies the user from the session (`auth.uid()`) — never from input.
2. Takes a per-mutation advisory lock, then **replays** the stored response if this
   mutation id was already processed (idempotency).
3. Checks ownership of every referenced id explicitly (account, destination,
   category, goal, record). Another user's id behaves exactly like a missing one.
4. For updates/deletes, requires `base_version` to equal the current version;
   otherwise returns `conflict` with the server's copy and changes nothing.
5. Converts rule violations into `rejected` with a safe message.
6. Writes a `sync_receipts` row with the full response — in the **same transaction**.

Users have **SELECT only** on finance tables; direct inserts/updates are refused.
Triggers re-check ownership, currency and category rules on every write as a second
line of defence.

| Entity                                                    | Operations                     | Used by                           |
| --------------------------------------------------------- | ------------------------------ | --------------------------------- |
| `transaction`                                             | create, update, delete         | Offline outbox → `POST /api/sync` |
| `financial_account`, `category`, `budget`, `savings_goal` | create, update (incl. archive) | Server Actions                    |
| `savings_goal_entry`                                      | create, delete                 | Server Actions                    |

## Finance events (foundation for Stage 3)

| Event                       | Produced when                                            | Dedupe key                        |
| --------------------------- | -------------------------------------------------------- | --------------------------------- |
| `budget_threshold_reached`  | An expense brings a budget's month to ≥ its threshold    | `budget:<id>:<YYYY-MM>:threshold` |
| `budget_exceeded`           | Spending passes the limit                                | `budget:<id>:<YYYY-MM>:exceeded`  |
| `savings_milestone_reached` | Saved amount crosses 25/50/75/100%                       | `goal:<id>:milestone:<pct>`       |
| `sync_failed`               | An offline transaction change ends in conflict/rejection | `sync_failed:<mutation id>`       |
| `sync_completed`            | A sync batch applied offline-created changes             | `sync_completed:<batch id>`       |

Each fires at most once per key, so there is no spam. Stage 3 will feed them through
`decideDelivery()` (quiet hours, category frequency, daily cap). Nothing is sent in Stage 2.
