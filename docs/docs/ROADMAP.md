# Roadmap

The hackathon plan ("Continue Development from Stage 3 to Hackathon Submission") replaced the
original Stage 3–8 order: Walrus Memory, Tatum/Sui and the intelligence engine came first.

| Stage                                   | Scope                                                                                                                           | Status                                                                                        |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 1 · Foundation                          | Auth, app shell, design system, settings, consent, audit log, export, deletion, RLS tests                                       | Done                                                                                          |
| 2 · Core finance                        | Accounts, transactions, categories, transfers, budgets, goals, dashboard; offline logging + sync                                | Done                                                                                          |
| 3 · External integrations               | Walrus Memory (MemWal SDK, Mainnet relayer); Tatum Sui Mainnet (read-only wallets, confirmed imports)                           | **Built and tested with the official mock / mocked Sui. Live check pending your credentials** |
| 4 · Financial intelligence and learning | Deterministic spending/budget/savings analysis; recommendations with explanations; accept/decline/change; learning from Walrus  | **Done** (learning verified end-to-end with the official MemWal mock)                         |
| 5 · Production readiness and security   | RLS + isolation for new tables, memory namespace isolation, consent disclosures, deletion record, rate limits, route protection | **Done** (see SECURITY.md)                                                                    |
| 6 · Testing                             | Unit, database, e2e; optional live checks; Walrus Mainnet ≥ 10-memory verification workflow                                     | **Done** — Mainnet run is yours to authorise                                                  |
| 7 · Deliverables                        | Docs, blog post, demo script, submission checklist                                                                              | **Done** — fill in the placeholders in HACKATHON_SUBMISSION.md                                |

## After the hackathon

- Subscriptions with renewals, planning, Nudge Center (finance events already recorded).
- Shared expenses; wellbeing tracking (memory categories for these stay locked until built).
- Incoming-transfer history for Sui wallets (needs an address-affecting transaction filter).
- CSV import; receipt attachments; currency conversion with explicit dated rates.
- Nonce-based CSP, error monitoring, custom SMTP, MFA review.
