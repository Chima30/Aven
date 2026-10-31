# Financial intelligence and the learning loop

Everything here is **deterministic TypeScript** in `src/lib/intelligence/`. No AI model, no
outside data, no invented numbers: the same records and memories always give the same output,
and every recommendation explains the figures it used.

## Analysis (`analysis.ts`)

Input: the user's transactions (last 6 complete months + this month), budgets and goals in their
**default currency**. Other currencies are listed and excluded — AVEN never converts.

| Signal                   | Rule                                                                                                             |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Typical spend            | Median of each category over complete months                                                                     |
| Projection               | From day 7: fixed recurring charges already paid + variable spend × days in month ÷ days elapsed                 |
| Overspending             | Over budget in ≥ 2 of the last 3 months · projected over budget · (no budget) projected > 1.25 × typical         |
| Recurring / subscription | Same merchant in ≥ 3 complete months, amounts within ±10%, day spread ≤ 5; subscription if category/name says so |
| Income pattern           | Average over months with income; "usual day" if the first income day varies ≤ 5 days                             |
| Savings rate             | (income − spending) ÷ income per complete month; 3-month average                                                 |
| Budgeting style          | none · light · structured (≥ 60% of spend budgeted, or an overall budget)                                        |
| Goal pace                | Required monthly = remaining ÷ months left; on track if the recent average net saving covers it                  |

## Recommendations (`recommend.ts`)

| Kind                    | When                                                      | Default suggestion                       |
| ----------------------- | --------------------------------------------------------- | ---------------------------------------- |
| `reduce_category_spend` | Category is overspending                                  | 10% below the higher of spend and budget |
| `set_category_budget`   | Large unbudgeted category (≥ 10% of monthly spending)     | Typical spend rounded up                 |
| `increase_savings`      | Savings rate below target (10%, or the remembered target) | Target % of average income               |
| `review_subscription`   | A detected subscription                                   | Its monthly cost, shown yearly too       |
| `goal_contribution`     | A goal that recent saving can't reach on time             | Required monthly amount                  |

At most six, ranked by how far over the reference the numbers are. One per kind/subject/month
(`dedupe_key`).

## Learning from Walrus (`learning.ts`)

Before recommending, AVEN recalls the user's memories from Walrus (three recall queries,
merged) and parses them into signals:

| Recalled memory                             | Effect on the next recommendation                                         |
| ------------------------------------------- | ------------------------------------------------------------------------- |
| A cut was **declined** once                 | Next cut is gentler: 5% instead of 10%, and the explanation says why      |
| Declined **twice** (latest was decline)     | Not suggested again; listed under "Not suggested because of your history" |
| The amount was **changed**                  | The user's own amount becomes the target                                  |
| A target was **accepted** and **met**       | A further 5% step                                                         |
| Accepted but **not met**                    | Same target kept — AVEN doesn't ask for more                              |
| A **savings target** was saved              | Replaces the 10% default (the target is stored only in Walrus)            |
| Savings step declined                       | Next step aims halfway; declined twice → withheld                         |
| New budgets declined twice                  | No more "set a budget" suggestions                                        |
| Subscription review declined                | Treated as "worth keeping"; not asked again                               |
| Category overspent in ≥ 2 remembered months | Ranked higher, with the reason shown                                      |

Every change is stored with the recommendation as `memory_influence` (blob id, the memory's
sentence, the effect) and shown under "Why this changed (from Walrus Memory)".

## The loop

```
records ─► analyse ─► recall from Walrus ─► signals ─► recommend + explain
   ▲                                                         │
   │                                                accept / decline / change
   │                                                         ▼
   └──── next visit ◄── recall ◄── Walrus ◄── remember(outcome) ◄── respond_to_recommendation()
```

Accepting or changing a "set a budget" suggestion also creates the budget through the normal
finance write path. Other answers record the decision only.

## Pattern memories (`memories.ts`)

From **completed months only**, at most 8 per run, deduplicated by content hash so repeated
visits don't create duplicates: savings performance for last month, categories over budget last
month, income pattern, up to 3 recurring payments/subscriptions, budgeting style, and goal
progress (in 10% bands). Amounts are rounded; no account names, balances or identifiers.

## Tests

`tests/unit/intelligence.test.ts` runs the whole loop against the official `MemWalMock`:
decline → gentler; decline twice → withheld; change → your number; accept + met → next step;
savings target in Walrus → savings recommendation; subscription declined → not asked again.
